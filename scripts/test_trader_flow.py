#!/usr/bin/env python3
"""Smoke test for trader_bot — drives the bot's entry/trail/close logic
against the live engine + demo broker without waiting for real signals.

Usage: .venv/bin/python scripts/test_trader_flow.py [--dry-run] [--symbol SYM]

Use --symbol for a 24/7 market (BTCUSD/ETHUSD) when FX is closed
(e.g. weekends): FX symbols will be rejected by the broker with
MARKET_CLOSED even though the engine still scans historical bars.

For the trailing-stop step to pass broker validation (SL must stay on
the correct side of the live bid/ask), run with small trail params:
  FX_BOT_TRAIL_ACTIVATE=0.05 FX_BOT_TRAIL_GAP=0.2 \
    .venv/bin/python scripts/test_trader_flow.py
"""
import argparse
import asyncio
import json
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

import zmq
import zmq.asyncio as azmq

import scripts.trader_bot as tb  # noqa: E402
from scripts.trader_bot import TraderBot  # noqa: E402


async def get_broker_quote(bot, symbol: str, seconds: float = 60.0):
    """Wait for a live BROKER tick (bid & ask both present). Only ticks
    carrying real bid/ask are authoritative for broker validation — a bar
    close is historical, never a tradable quote."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            raw = await bot.sub.recv()
        except zmq.Again:
            continue
        frame = raw.decode(errors="replace")
        try:
            topic, payload = frame.split(" ", 1)
            data = json.loads(payload)
        except Exception:
            continue
        if topic == "ticker" and str(data.get("symbol", "")).upper() == symbol:
            bid, ask = data.get("bid"), data.get("ask")
            if bid is not None and ask is not None and float(bid) > 0 and float(ask) > 0:
                return data
    return None


async def non_mock_candles(bot, symbol: str, limit: int = 5) -> list:
    """Last candles from the engine — the engine is cTrader-only and fails
    closed, but we still refuse bars not explicitly flagged cTrader."""
    res = await bot._req({"cmd": "GET_CANDLES", "symbol": symbol,
                          "limit": limit}, retries=2)
    if (isinstance(res, dict) and res.get("source") == "ctrader"
            and not res.get("mock") and res.get("candles")):
        return res["candles"]
    return []


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--symbol", default="EURUSD",
                    help="symbol to test (default EURUSD; use BTCUSD/ETHUSD "
                         "when FX is closed on weekends)")
    args = ap.parse_args()
    if args.dry_run:
        tb.DRYRUN = True
    sym = args.symbol.upper()

    with urllib.request.urlopen("http://127.0.0.1:8765/health", timeout=5) as resp:
        h = json.loads(resp.read().decode())
    bot = TraderBot(int(h["zmq_pub"]), int(h["zmq_cmd"]))
    bot.running = True

    # The mobile-network broker connection cycles every few minutes;
    # wait for it to come back instead of aborting.
    connected = False
    for _ in range(24):
        st = await bot.status()
        info = st.get("info", {})
        if info.get("connected") is True:
            connected = True
            break
        print(f"broker: {st.get('status')} connected={info.get('connected')} "
              f"— waiting 15s", flush=True)
        await asyncio.sleep(15)
    if not connected:
        print("FAIL: broker not connected after 6 min", flush=True)
        return 2
    print(f"broker: ok connected={info.get('connected')} "
          f"balance={info.get('balance')}", flush=True)

    # 1) Live quote so SL/TP pass the broker's validation. Only real
    #    broker ticks (bid/ask present) are authoritative — the engine is
    #    cTrader-only and fails closed, so a bar-close fallback (below) is
    #    real cTrader data but still historical. Scan cadence is slow on
    #    mobile net, so wait generously.
    q = await get_broker_quote(bot, sym, seconds=90)
    if q is None:
        cdl = await non_mock_candles(bot, sym)
        if cdl:
            px = float(cdl[-1]["close"])
            q = {"symbol": sym, "bid": px, "ask": px,
                 "timestamp": "candles"}
    if q is None:
        print(f"FAIL: no broker-anchored {sym} quote in 90s", flush=True)
        return 2
    bot.quotes[sym] = {"bid": q["bid"], "ask": q["ask"],
                       "ts": q["timestamp"]}
    print(f"quote: {sym} bid={q['bid']} ask={q['ask']} src={q['timestamp']}",
          flush=True)

    # 2) Entry — synthetic signal through the bot's real entry logic.
    sig = {"symbol": sym, "action": "BUY", "confidence": 0.7,
           "id": "SMOKE-001", "price": q["ask"]}
    await bot.on_signal(sig)
    if sym not in bot.positions:
        print("FAIL: entry did not open a position", flush=True)
        return 2
    hold = bot.positions[sym]
    print(f"ENTRY: side={hold['side']} vol={hold.get('volume')} "
          f"sl={hold.get('stop_loss')} tp={hold.get('take_profit')} "
          f"(dry={hold.get('dry', False)})", flush=True)

    # 3) Trail — bump a FRESH real tick slightly favorable. The broker
    #    validates the amended SL against its live bid, so a synthetic
    #    tick detached from the market (e.g. entry + 1.2*stop_dist)
    #    always gets rejected. Run with small activate/gap env values:
    #    FX_BOT_TRAIL_ACTIVATE=0.05 FX_BOT_TRAIL_GAP=0.2 so the tiny
    #    bump clears the activation threshold yet keeps SL under bid.
    fresh = await get_broker_quote(bot, sym, seconds=30)
    if fresh is not None:
        base = (float(fresh["bid"]) + float(fresh["ask"])) / 2
    else:
        cdl = await non_mock_candles(bot, sym)
        base = float(cdl[-1]["close"]) if cdl else None
    if base is None:
        print("FAIL: no broker-anchored fresh price for trail step",
              flush=True)
        return 2
    # Mid ~0.1x stop_dist above base (clears the 0.05x activation
    # threshold), new SL = mid - gap lands below the live bid (passes
    # server validation) yet above the tick's bid (passes the bot's
    # stale-tick clamp). Scaling off the bot's real trail distance keeps
    # this valid at any price magnitude (EURUSD 5dp vs BTCUSD 3dp).
    dist = bot.trail.get(sym, {}).get("dist")
    if not dist:
        print("FAIL: no trail distance recorded for entry", flush=True)
        return 2
    bump = 0.1 * float(dist)
    fav_tick = {"symbol": sym, "bid": base + 0.8 * bump,
                "ask": base + 1.2 * bump, "timestamp": "smoke"}
    before = bot.trail.get(sym, {}).get("sl")
    await bot.on_ticker(fav_tick)
    after = bot.trail.get(sym, {}).get("sl")
    print(f"TRAIL: sl {before} -> {after} "
          f"({'raised' if after and before and after > before else 'no move'})",
          flush=True)

    # 4) Close.
    await bot.close_and_log(sym, "smoke_test")
    closed = sym not in bot.positions
    print(f"CLOSE: {'ok' if closed else 'FAILED'}", flush=True)
    if not closed:
        # Cleanup: force-close through the engine.
        res = await bot.close(sym)
        print(f"cleanup: {res}", flush=True)

    print("PASS" if closed else "FAIL", flush=True)
    bot.ctx.term()
    return 0 if closed else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
