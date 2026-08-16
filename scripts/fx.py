#!/usr/bin/env python3
"""fx — terminal control for the FX Analyzer Pro engine.

Talks to the running engine through its HTTP bridge (POST /cmd), the same
transport the Node backend falls back to. Zero third-party deps (stdlib only),
so it runs on any python3 on this device.

Usage:
    fx status                     broker + agent bridge status
    fx models                     list configured LLM models
    fx model <name>               switch the global LLM model
    fx candles <SYMBOL> [--limit N]   fetch OHLC candles (EURUSD, BTCUSD, ...)
    fx analyze "<query>" [--agents a,b,c] [--rounds N] [--risk-rounds N]
                                  run the trading-agent analysis (LLM debate)
    fx trade <SYMBOL> <buy|sell> [--volume 0.01] [--sl X] [--tp X]
                                  execute a market order via the broker
    fx close --symbol <SYMBOL> | --position-id <ID> [--volume V]
                                  close an open position
    fx positions                  open positions
    fx orders                     pending orders
    fx signals [--limit N]        recent signals from the DB
    fx watch [--topics signal,ticker]   stream engine events live
    fx brief                      latest vibe-research briefing from the DB

Env: FX_HTTP_URL overrides the bridge endpoint (default http://127.0.0.1:8765).
"""
import argparse
import json
import os
import sqlite3
import sys
import urllib.request
from pathlib import Path

BRIDGE_URL = os.environ.get("FX_HTTP_URL", "http://127.0.0.1:8765")
REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("FX_DB", str(REPO_ROOT / "fx_analyzer.db"))


def cmd(payload: dict, timeout: int = 120) -> dict:
    """POST a command to the engine HTTP bridge and return the JSON reply."""
    req = urllib.request.Request(
        f"{BRIDGE_URL}/cmd",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        sys.exit(f"error: engine unreachable at {BRIDGE_URL}: {e}")


def fmt(data, indent: int = 2) -> str:
    return json.dumps(data, indent=indent, default=str)


def rows(sql: str, params=()) -> list:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, params).fetchall()]
    finally:
        con.close()


def status(args):
    broker = cmd({"cmd": "MT5_STATUS"})
    agent = cmd({"cmd": "AGENT_BRIDGE_STATUS"}, timeout=15)
    info = broker.get("info", {})
    print(f"broker:      {broker.get('status')}  provider={info.get('provider')} "
          f"mode={info.get('mode')} connected={info.get('connected')}")
    if info.get("account"):
        print(f"account:     {info['account']} ({info.get('server')}) "
              f"balance={info.get('balance')} equity={info.get('equity')} "
              f"currency={info.get('currency')}")
    if info.get("message"):
        print(f"message:     {info['message']}")
    print(f"agent bridge: {'ok' if agent.get('initialized') else 'NOT INITIALIZED'}")


def models(args):
    res = cmd({"cmd": "GET_MODELS"})
    if res.get("status") != "ok":
        print(fmt(res))
        return
    print(f"global: {res.get('model', '?')}")
    for m in res.get("models_list", []):
        print(f"  - {m}")


def set_model(args):
    res = cmd({"cmd": "SET_LLM_MODEL", "model": args.name})
    print(fmt(res))


def candles(args):
    res = cmd({"cmd": "GET_CANDLES", "symbol": args.symbol, "limit": args.limit}, timeout=60)
    if res.get("status") != "ok":
        print(fmt(res))
        return
    print(f"{res['symbol']}  count={res['count']}  mock={res.get('mock')}  cached={res.get('cached', False)}")
    print(f"{'time':>12} {'open':>10} {'high':>10} {'low':>10} {'close':>10} {'vol':>8}")
    for c in res.get("candles", [])[-args.limit:]:
        from datetime import datetime, timezone
        ts = datetime.fromtimestamp(c["time"], tz=timezone.utc).strftime("%m-%d %H:%M")
        print(f"{ts:>12} {c['open']:>10.5f} {c['high']:>10.5f} {c['low']:>10.5f} "
              f"{c['close']:>10.5f} {c['volume']:>8.0f}")


def analyze(args):
    payload = {"cmd": "ENGINE_AGENT_ANALYZE", "query": args.query}
    if args.agents:
        payload["active_agents"] = [a.strip() for a in args.agents.split(",")]
    if args.rounds:
        payload["debate_rounds"] = args.rounds
    if args.risk_rounds:
        payload["risk_rounds"] = args.risk_rounds
    res = cmd(payload, timeout=args.timeout)
    if res.get("status") not in (None, "ok", "completed", "success"):
        print(fmt(res))
        return
    # Surface the verdict line first when present.
    if isinstance(res, dict):
        verdict = res.get("verdict") or res.get("final_verdict") or res.get("consensus")
        if verdict:
            print(f"VERDICT: {verdict}\n")
        for k, v in res.items():
            if k in ("status", "verdict", "final_verdict", "consensus", "moeConsensus"):
                continue
            if isinstance(v, str):
                print(f"{k}: {v[:4000]}")
            else:
                print(f"{k}: {json.dumps(v, default=str)[:4000]}")
        if res.get("moeConsensus"):
            print(f"\nmoe consensus: {fmt(res['moeConsensus'])}")
    else:
        print(fmt(res))


def trade(args):
    payload = {
        "cmd": "EXECUTE_TRADE",
        "symbol": args.symbol,
        "action": args.side,
        "volume": args.volume,
    }
    if args.sl is not None:
        payload["sl"] = args.sl
    if args.tp is not None:
        payload["tp"] = args.tp
    res = cmd(payload, timeout=60)
    if res.get("status") == "filled":
        print(f"FILLED  ticket={res.get('ticket')} position_id={res.get('position_id')}")
    else:
        print(fmt(res))


def amend(args):
    payload = {"cmd": "AMEND_TRADE"}
    if args.position_id:
        payload["position_id"] = args.position_id
    else:
        payload["symbol"] = args.symbol
    if args.sl is not None:
        payload["sl"] = args.sl
    if args.tp is not None:
        payload["tp"] = args.tp
    res = cmd(payload, timeout=60)
    if res.get("status") == "amended":
        print(f"AMENDED  position_id={res.get('position_id')} "
              f"sl={res.get('stop_loss')} tp={res.get('take_profit')}")
    else:
        print(fmt(res))


def close(args):
    payload = {"cmd": "CLOSE_TRADE"}
    if args.position_id:
        payload["position_id"] = args.position_id
    else:
        payload["symbol"] = args.symbol
    if args.volume is not None:
        payload["volume"] = args.volume
    res = cmd(payload, timeout=60)
    if res.get("status") == "closed":
        print(f"CLOSED  position_id={res.get('position_id')} ticket={res.get('ticket')}")
    else:
        print(fmt(res))


def positions(args):
    res = cmd({"cmd": "BROKER_POSITIONS"})
    print(fmt(res, indent=2))


def orders(args):
    res = cmd({"cmd": "BROKER_ORDERS"})
    print(fmt(res, indent=2))


def signals(args):
    sigs = rows(
        "SELECT id, symbol, action, confidence, price, timestamp "
        "FROM signals ORDER BY id DESC LIMIT ?", (args.limit,)
    )
    if not sigs:
        print("no signals recorded yet")
        return
    for s in sigs:
        conf = f"{float(s['confidence']):.2f}" if s.get("confidence") is not None else "-"
        print(f"#{s['id']:<14} {s['symbol']:<10} {str(s['action']):<5} conf={conf:<5} "
              f"price={s.get('price')}  {s.get('timestamp', '')}")


def brief(args):
    rows_out = rows("SELECT * FROM vibe_research ORDER BY id DESC LIMIT 1")
    if not rows_out:
        print("no vibe research recorded yet")
        return
    r = rows_out[0]
    print(f"=== {r.get('run_type')}  {r.get('timestamp', '')}  status={r.get('status')}")
    print(r.get("output", "")[:6000])


def watch(args):
    topics = args.topics.split(",") if args.topics else None
    req = urllib.request.Request(f"{BRIDGE_URL}/events")
    try:
        with urllib.request.urlopen(req, timeout=None) as resp:
            for raw in resp:
                line = raw.decode(errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                try:
                    payload = json.loads(line.split(":", 1)[1].strip())
                except Exception:
                    print(line, flush=True)
                    continue
                # The bridge wraps frames as {"topic": ..., "data": ...}.
                topic = payload.get("topic", "event")
                if topics and topic not in topics:
                    continue
                print(f"[{topic}] {json.dumps(payload.get('data', payload), default=str)}",
                      flush=True)
    except KeyboardInterrupt:
        pass


def main():
    p = argparse.ArgumentParser(prog="fx", description="FX Analyzer Pro terminal control")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("status").set_defaults(fn=status)
    sub.add_parser("models").set_defaults(fn=models)
    m = sub.add_parser("model", help="switch global LLM model")
    m.add_argument("name")
    m.set_defaults(fn=set_model)

    c = sub.add_parser("candles")
    c.add_argument("symbol")
    c.add_argument("--limit", type=int, default=100)
    c.set_defaults(fn=candles)

    a = sub.add_parser("analyze", help="run trading-agent LLM analysis")
    a.add_argument("query")
    a.add_argument("--agents", help="comma-separated agent list (default: all)")
    a.add_argument("--rounds", type=int, help="debate rounds")
    a.add_argument("--risk-rounds", type=int, help="risk debate rounds")
    a.add_argument("--timeout", type=int, default=300)
    a.set_defaults(fn=analyze)

    t = sub.add_parser("trade", help="execute a market order")
    t.add_argument("symbol")
    t.add_argument("side", choices=["buy", "sell"])
    t.add_argument("--volume", type=float, default=0.01)
    t.add_argument("--sl", type=float)
    t.add_argument("--tp", type=float)
    t.set_defaults(fn=trade)

    x = sub.add_parser("close", help="close an open position (by symbol or id)")
    x.add_argument("--symbol", help="close first open position of this symbol")
    x.add_argument("--position-id")
    x.add_argument("--volume", type=float, help="close only this much (lots)")
    x.set_defaults(fn=close)

    am = sub.add_parser("amend", help="amend SL/TP of an open position")
    am.add_argument("--symbol", help="first open position of this symbol")
    am.add_argument("--position-id")
    am.add_argument("--sl", type=float, help="new stop loss price")
    am.add_argument("--tp", type=float, help="new take profit price")
    am.set_defaults(fn=amend)

    sub.add_parser("positions").set_defaults(fn=positions)
    sub.add_parser("orders").set_defaults(fn=orders)

    s = sub.add_parser("signals")
    s.add_argument("--limit", type=int, default=20)
    s.set_defaults(fn=signals)

    sub.add_parser("brief").set_defaults(fn=brief)

    w = sub.add_parser("watch", help="stream live engine events (ticker, signal, ...)")
    w.add_argument("--topics", help="comma-separated topic filter")
    w.set_defaults(fn=watch)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
