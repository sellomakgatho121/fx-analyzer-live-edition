#!/usr/bin/env python3
"""trader_bot — autonomous trading robot for FX Analyzer Pro.

The engine does the thinking (technical scan -> 4-agent MoE consensus,
published as "signal" events). This bot is the management layer a premium
trading robot needs:

  ENTRY    signal-driven, filtered by confidence / agent agreement /
           allowlist / max positions; risk-based sizing (fixed % of equity
           divided by ATR stop distance); SL/TP placed relative to the live
           quote so the broker validates them.
  EXITS    1) initial SL/TP (RR 2:1)     2) trailing stop via AMEND_TRADE as
           price moves in our favor      3) reversal exit when the engine
           publishes an opposite signal   4) time stop (max hold)
  SAFETY   daily loss circuit breaker (halts entries, resets at UTC midnight),
           max positions, per-symbol one-position rule, kill-switch file,
           dry-run mode. Every decision is appended to data/trader_log.jsonl
           and executions are stored in the engine DB.

Config (env):
  FX_BOT_MIN_CONFIDENCE  0.62   skip signals below this confidence
  FX_BOT_MAX_POSITIONS   3      max concurrent positions
  FX_BOT_RISK_PCT        0.5    % of equity risked per trade
  FX_BOT_RR              2.0    take-profit distance = RR x stop distance
  FX_BOT_TRAIL_ACTIVATE  0.5    trail once profit >= this x stop distance
  FX_BOT_TRAIL_GAP       0.8    stop gap while trailing, x stop distance
  FX_BOT_MAX_HOLD_MIN    240    close after this many minutes
  FX_BOT_DAILY_LOSS_PCT  2.0    halt new entries after this % equity loss
  FX_BOT_SYMBOLS               comma-separated allowlist (default all)
  FX_BOT_VOLUME_MIN      0.01   minimum lot size
  FX_BOT_VOLUME_MAX      0.10   maximum lot size
  FX_BOT_DRYRUN          0/1    log decisions but never trade
  FX_BOT_RESEARCH        0/1    fetch Google News headlines before entry
  FX_BOT_LLM             0/1    LLM advisory gate (OpenCode Zen, reasoning=max)
  FX_BOT_CONTRACT_SIZES        per-symbol lots->units map e.g. ETHUSD=1,BTCUSD=1
                                (default ETHUSD=1,BTCUSD=1; everything else 100k)
  FX_HTTP_URL            8765   bridge used to resolve ZMQ ports

Run:  .venv/bin/python scripts/trader_bot.py [--dry-run] [--trades N]
  --trades N stops autonomously after N closed trades and prints a
  win/loss summary (sessions are also persisted to data/sessions.jsonl).
"""
import argparse
import asyncio
import json
import os
import signal
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import zmq
import zmq.asyncio as azmq

from engine import database  # noqa: E402
from llm_advisor import advise  # noqa: E402

DB_PATH = os.environ.get("FX_DB", str(REPO_ROOT / "fx_analyzer.db"))
LOG_PATH = REPO_ROOT / "data" / "trader_log.jsonl"
KILL_FILE = REPO_ROOT / "data" / "trader_halt"
SESSIONS_PATH = REPO_ROOT / "data" / "sessions.jsonl"
BRIDGE_URL = os.environ.get("FX_HTTP_URL", "http://127.0.0.1:8765")

MIN_CONFIDENCE = float(os.environ.get("FX_BOT_MIN_CONFIDENCE", 0.45))
MAX_POSITIONS = int(os.environ.get("FX_BOT_MAX_POSITIONS", 3))
RISK_PCT = float(os.environ.get("FX_BOT_RISK_PCT", 0.5)) / 100.0
RR = float(os.environ.get("FX_BOT_RR", 2.0))
TRAIL_ACTIVATE = float(os.environ.get("FX_BOT_TRAIL_ACTIVATE", 0.5))
TRAIL_GAP = float(os.environ.get("FX_BOT_TRAIL_GAP", 0.8))
MAX_HOLD_MIN = float(os.environ.get("FX_BOT_MAX_HOLD_MIN", 240))
DAILY_LOSS_PCT = float(os.environ.get("FX_BOT_DAILY_LOSS_PCT", 2.0)) / 100.0
ALLOWED = [s.upper() for s in os.environ.get("FX_BOT_SYMBOLS", "").split(",") if s]
VOL_MIN = float(os.environ.get("FX_BOT_VOLUME_MIN", 0.01))
VOL_MAX = float(os.environ.get("FX_BOT_VOLUME_MAX", 0.10))
DRYRUN = os.environ.get("FX_BOT_DRYRUN", "0") == "1"
RESEARCH = os.environ.get("FX_BOT_RESEARCH", "1") == "1"
LLM_ADVISORY = os.environ.get("FX_BOT_LLM", "1") == "1"
# Hard wall-clock deadline for a single advisory call. DNS resolution can
# hang far beyond urllib's socket timeout on a flapping mobile network,
# and a hung advisory must NEVER freeze the bot loop.
LLM_ADVISORY_TIMEOUT = float(os.environ.get("FX_LLM_ADVISORY_TIMEOUT", "150"))

TERMINAL_EXEC = ("FILLED", "EXECUTE(dry)", "FAILED")
EXIT_REASONS = {"reversal", "time_stop", "trail_guard", "daily_loss",
                "manual", "signal_close"}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class TraderBot:
    def stop(self):
        self.running = False

    def __init__(self, pub_port: int, cmd_port: int):
        self.ctx = azmq.Context()
        self.sub = self.ctx.socket(zmq.SUB)
        self.sub.setsockopt(zmq.SUBSCRIBE, b"signal")
        self.sub.setsockopt(zmq.SUBSCRIBE, b"ticker")
        self.sub.setsockopt(zmq.SUBSCRIBE, b"notification")
        self.sub.setsockopt(zmq.RCVTIMEO, 2000)
        self.sub.connect(f"tcp://127.0.0.1:{pub_port}")
        self.rep = self.ctx.socket(zmq.REQ)
        self.rep.setsockopt(zmq.LINGER, 0)
        # Engine commands can hold the REP for 30s+ while awaiting broker
        # execution events; a too-short timeout breaks the REQ state
        # machine (resend after a timed-out recv raises EFSM).
        self.rep.setsockopt(zmq.RCVTIMEO, 90000)
        self.rep.connect(f"tcp://127.0.0.1:{cmd_port}")
        self.cmd_port = cmd_port
        # One REQ socket serves both the main loop and the health loop
        # (separate asyncio tasks). ZMQ REQ is strictly send→recv
        # alternated, so concurrent use raises EFSM; every exchange must
        # be serialized.
        self._req_lock = asyncio.Lock()
        self.positions: dict[str, dict] = {}   # symbol -> position dict
        self.quotes: dict[str, dict] = {}      # symbol -> {"bid","ask"}
        self.hold_start: dict[str, float] = {}  # symbol -> entry epoch
        self.trail: dict[str, dict] = {}       # symbol -> {"sl","step","gap"}
        self.day: str = utcnow()[:10]
        self.day_start_equity: float | None = None
        self.day_closed_pl = 0.0
        self.run_until = time.monotonic() + 3600
        self.running = True
        self._started = time.monotonic()
        # Session accounting for the --trades N stop and win/loss summary.
        self.trades_limit = 0            # 0 = unlimited
        self.trades_closed = 0
        self.wins = 0
        self.losses = 0
        self.net_pl = 0.0
        self.closed_records: list[dict] = []
        # Per-symbol contract size (units per 1.0 lot): FX pairs are
        # 100_000, crypto/CFD (ETHUSD, BTCUSD) are 1 unit per lot on this
        # broker. The cTrader SymbolsList JSON does not carry this field,
        # so it is a static map overridable via FX_BOT_CONTRACT_SIZES
        # ("ETHUSD=1,BTCUSD=1").
        self.contract_sizes: dict[str, float] = {
            "ETHUSD": 1.0, "BTCUSD": 1.0,
        }
        for kv in os.environ.get("FX_BOT_CONTRACT_SIZES", "").split(","):
            if "=" in kv:
                k, v = kv.split("=", 1)
                try:
                    self.contract_sizes[k.strip().upper()] = float(v)
                except ValueError:
                    pass

    def contract_size(self, symbol: str) -> float:
        return self.contract_sizes.get(symbol.upper(), 100_000.0)

    # ------------------------------------------------------------------
    # transport
    # ------------------------------------------------------------------
    async def _req(self, payload: dict, retries: int = 3) -> dict:
        for attempt in range(1, retries + 1):
            try:
                async with self._req_lock:
                    await self.rep.send_json(payload)
                    res = await self.rep.recv_json()
                if isinstance(res, dict) and res.get("message") == "Try again":
                    await asyncio.sleep(2 * attempt)
                    continue
                return res
            except zmq.Again:
                # A REQ socket is stuck after a timed-out recv; rebuild it
                # before retrying, or the next send raises EFSM.
                async with self._req_lock:
                    self._rebuild_req()
                await asyncio.sleep(2 * attempt)
            except Exception as e:
                return {"status": "error", "message": str(e)}
        return {"status": "error", "message": "Try again (engine busy)"}

    def _rebuild_req(self):
        """Close and reconnect the REQ socket (required after a timed-out
        recv — REQ sockets cannot be reused in that state)."""
        try:
            self.rep.close()
        except Exception:
            pass
        self.rep = self.ctx.socket(zmq.REQ)
        self.rep.setsockopt(zmq.LINGER, 0)
        self.rep.setsockopt(zmq.RCVTIMEO, 90000)
        self.rep.connect(f"tcp://127.0.0.1:{self.cmd_port}")

    async def status(self) -> dict:
        return await self._req({"cmd": "MT5_STATUS"})

    async def refresh_positions(self) -> list[dict]:
        res = await self._req({"cmd": "BROKER_POSITIONS"})
        if isinstance(res, dict) and isinstance(res.get("positions"), list):
            return res["positions"]
        if isinstance(res, list):
            return res
        return []

    async def candles(self, symbol: str, limit: int = 40) -> dict:
        res = await self._req({"cmd": "GET_CANDLES", "symbol": symbol,
                               "limit": limit}, retries=2)
        # Surface the engine's explicit source label (source/mock) so
        # callers can refuse non-cTrader bars.
        if (isinstance(res, dict) and res.get("status") == "ok"
                and isinstance(res.get("candles"), list)):
            return res
        return {"status": "error", "candles": [], "source": None,
                "mock": False}

    async def execute(self, symbol: str, action: str, volume: float,
                      sl: float, tp: float) -> dict:
        return await self._req({
            "cmd": "EXECUTE_TRADE", "symbol": symbol,
            "action": action.lower(), "volume": volume, "sl": sl, "tp": tp,
        })

    async def close(self, symbol: str) -> dict:
        hold = self.positions.get(symbol, {})
        if hold.get("position_id"):
            return await self._req({
                "cmd": "CLOSE_TRADE", "symbol": symbol,
                "position_id": hold["position_id"],
            })
        return await self._req({"cmd": "CLOSE_TRADE", "symbol": symbol})

    async def amend(self, symbol: str, sl: float | None = None,
                    tp: float | None = None) -> dict:
        payload = {"cmd": "AMEND_TRADE", "symbol": symbol}
        if sl is not None:
            payload["sl"] = sl
        if tp is not None:
            payload["tp"] = tp
        return await self._req(payload)

    # ------------------------------------------------------------------
    # strategy helpers
    # ------------------------------------------------------------------
    @staticmethod
    def atr(candles: list, n: int = 14) -> float:
        ranges = [float(c["high"]) - float(c["low"]) for c in candles if
                  c.get("high") and c.get("low")]
        return (sum(ranges[-n:]) / min(n, len(ranges))) if ranges else 0.0

    def size(self, symbol: str, equity: float, stop_dist: float) -> float:
        """Fixed-fraction sizing: lots = (equity * risk%) / (stop * contract/lot)."""
        if stop_dist <= 0 or equity <= 0:
            return VOL_MIN
        lots = (equity * RISK_PCT) / (stop_dist * self.contract_size(symbol))
        return max(VOL_MIN, min(VOL_MAX, round(lots, 2)))

    def halt_file(self) -> bool:
        return KILL_FILE.exists()

    def new_day(self) -> bool:
        today = utcnow()[:10]
        if today != self.day:
            self.day = today
            self.day_start_equity = None
            self.day_closed_pl = 0.0
            return True
        return False

    async def daily_equity(self) -> float:
        st = await self.status()
        info = st.get("info", {})
        eq = info.get("equity") or info.get("balance") or 0
        if self.day_start_equity is None and eq:
            self.day_start_equity = float(eq)
        return float(eq)

    def log(self, entry: dict):
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a") as f:
            f.write(json.dumps(entry, default=str) + "\n")
        print(f"[{entry.get('ts', utcnow())[11:19]}] "
              f"{entry.get('kind', '?')} {entry.get('symbol', ''):<8} "
              f"{entry.get('action', entry.get('decision', '')):<10} "
              f"{entry.get('detail', '')}", flush=True)

    def store_trade(self, position: dict, status: str, pl: float = 0.0,
                    note: str = ""):
        try:
            database.store_trade({
                "symbol": position.get("symbol"),
                "action": position.get("side"),
                "entry_price": position.get("price"),
                "exit_price": position.get("close_price"),
                "pl": pl,
                "status": status,
                "timestamp": utcnow(),
                "comment": note,
            })
        except Exception as e:
            self.log({"kind": "error", "detail": f"db store failed: {e}"})

    # ------------------------------------------------------------------
    # research (Google News RSS, best-effort)
    # ------------------------------------------------------------------
    def research_news(self, symbol: str, action: str) -> list[str]:
        """Fetch top headlines for the pair as entry/exit context.

        Non-blocking and failure-tolerant: any network error returns [] so
        an entry decision never depends on the search.
        """
        if not RESEARCH:
            return []
        q = urllib.parse.quote(f"{symbol} {action} forex forecast")
        url = (f"https://news.google.com/rss/search?q={q}"
               "&hl=en-US&gl=US&ceid=US:en")
        try:
            with urllib.request.urlopen(url, timeout=6) as resp:
                raw = resp.read(200_000)
            root = ET.fromstring(raw)
            titles = [it.findtext("title", "") for it in root.iter("item")]
            return [t for t in titles if t][:5]
        except Exception as e:
            self.log({"ts": utcnow(), "kind": "research",
                      "symbol": symbol, "decision": "research_error",
                      "detail": str(e)[:120]})
            return []

    # ------------------------------------------------------------------
    # session accounting (--trades N + win/loss summary)
    # ------------------------------------------------------------------
    def realized_pl(self, symbol: str, side: str, entry: float,
                    exit_: float, vol: float) -> float:
        contract = self.contract_size(symbol)
        if side == "BUY":
            return (exit_ - entry) * vol * contract
        return (entry - exit_) * vol * contract

    def record_close(self, symbol: str, reason: str, exit_price: float,
                     estimated: bool = False) -> float:
        """Tally a closed trade: wins/losses/net_pl/day P/L + DB row.

        Returns the realized P/L (0.0 when prices are unavailable).
        """
        hold = self.positions.get(symbol, {})
        entry = float(hold.get("price") or 0)
        vol = float(hold.get("volume") or 0)
        side = hold.get("side", "")
        pl = 0.0
        if entry and exit_price and vol:
            pl = self.realized_pl(symbol, side, entry, exit_price, vol)
        self.trades_closed += 1
        self.net_pl += pl
        self.day_closed_pl += pl
        if pl > 0:
            self.wins += 1
        else:
            self.losses += 1
        rec = {
            "ts": utcnow(), "symbol": symbol, "side": side,
            "entry": round(entry, 6), "exit": round(exit_price, 6),
            "volume": vol, "pl": round(pl, 2), "reason": reason,
            "estimated": estimated,
        }
        self.closed_records.append(rec)
        hold["close_price"] = exit_price
        self.store_trade(hold, "CLOSED", pl=pl,
                         note=f"auto close ({reason})")
        self.log({"ts": utcnow(), "kind": "close", "symbol": symbol,
                  "action": reason, "decision": "CLOSED",
                  "detail": f"pl={pl:+.2f} @ {exit_price}"})
        if self.trades_limit and self.trades_closed >= self.trades_limit:
            self.running = False
        return pl

    def session_summary(self) -> dict:
        """Persist the session to data/sessions.jsonl and print it."""
        total = self.trades_closed
        summary = {
            "ts": utcnow(),
            "mode": "DRY-RUN" if DRYRUN else "LIVE",
            "duration_min": round((time.monotonic() - self._started) / 60, 1),
            "trades": total,
            "wins": self.wins,
            "losses": self.losses,
            "win_rate": round(self.wins / total * 100, 1) if total else 0.0,
            "net_pl": round(self.net_pl, 2),
            "trades_limit": self.trades_limit,
            "closed": self.closed_records,
        }
        try:
            SESSIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(SESSIONS_PATH, "a") as f:
                f.write(json.dumps(summary, default=str) + "\n")
        except OSError as e:
            self.log({"kind": "error",
                      "detail": f"session save failed: {e}"})
        print(f"\n=== SESSION SUMMARY ({summary['mode']}) ==="
              f"\n  trades closed : {total}"
              f"\n  wins          : {self.wins}"
              f"\n  losses        : {self.losses}"
              f"\n  win rate      : {summary['win_rate']}%"
              f"\n  net P/L       : {summary['net_pl']:+.2f}"
              f"\n  duration      : {summary['duration_min']} min"
              f"\n===============================", flush=True)
        return summary

    # ------------------------------------------------------------------
    # entry
    # ------------------------------------------------------------------
    async def on_signal(self, sig: dict):
        action = str(sig.get("action", "HOLD")).upper()
        symbol = str(sig.get("symbol", "?")).upper()
        conf = float(sig.get("confidence", 0) or 0)
        if action not in ("BUY", "SELL"):
            return
        entry = {"ts": utcnow(), "kind": "signal", "symbol": symbol,
                 "action": action,
                 "confidence": round(conf, 3),
                 "price": sig.get("price"),
                 "signal_id": sig.get("id")}
        if conf < MIN_CONFIDENCE:
            entry["decision"] = "skip_confidence"
            self.log(entry)
            return
        if ALLOWED and symbol not in ALLOWED:
            entry["decision"] = "skip_allowlist"
            self.log(entry)
            return
        if self.halt_file():
            entry["decision"] = "skip_halt_file"
            self.log(entry)
            return
        if symbol in self.positions:
            held = self.positions[symbol]
            if held.get("side") == action:
                entry["decision"] = "skip_holding"
                self.log(entry)
                return
            # Reversal exit: opposite signal on a held symbol closes it.
            entry["decision"] = "close_reversal"
            self.log(entry)
            await self.close_and_log(symbol, "reversal")
            return

        positions = await self.refresh_positions()
        entry["open_positions"] = len(positions)
        if len(positions) >= MAX_POSITIONS:
            entry["decision"] = "skip_max_positions"
            self.log(entry)
            return

        self.new_day()
        eq = await self.daily_equity()
        if self.day_start_equity and self.day_closed_pl <= -DAILY_LOSS_PCT * self.day_start_equity:
            entry["decision"] = "skip_daily_loss_breaker"
            self.log(entry)
            return

        # Build SL/TP from volatility, relative to the live quote. ATR is
        # only meaningful for real cTrader bars; without them we cannot size
        # the trade, so fail closed.
        candles_res = await self.candles(symbol)
        if candles_res.get("source") != "ctrader" or candles_res.get("mock"):
            entry["decision"] = "skip_no_ctrader_data"
            entry["detail"] = f"candles source={candles_res.get('source')}"
            self.log(entry)
            return
        candles = candles_res.get("candles", [])
        a = self.atr(candles)
        q = self.quotes.get(symbol)
        if q is None or q.get("bid") is None or q.get("ask") is None:
            entry["decision"] = "skip_no_quote"
            self.log(entry)
            return
        stop_dist = max(a * 1.2, 0.0008)
        if action == "BUY":
            entry_price = q["ask"]
            sl = entry_price - stop_dist
            tp = entry_price + stop_dist * RR
        else:
            entry_price = q["bid"]
            sl = entry_price + stop_dist
            tp = entry_price - stop_dist * RR

        vol = self.size(symbol, eq, stop_dist)
        entry["volume"] = vol
        entry["sl"] = round(sl, 6)
        entry["tp"] = round(tp, 6)
        entry["stop_dist"] = round(stop_dist, 6)
        entry["atr"] = round(a, 6)

        # News research for entry/exit context (best-effort, non-blocking).
        if RESEARCH:
            try:
                headlines = await asyncio.wait_for(
                    asyncio.to_thread(self.research_news, symbol, action),
                    timeout=20)
            except (asyncio.TimeoutError, TimeoutError):
                headlines = []
            if headlines:
                entry["research"] = headlines
                self.log({"ts": utcnow(), "kind": "research",
                          "symbol": symbol, "action": action,
                          "decision": "research",
                          "detail": " | ".join(headlines[:3])})

        # LLM advisory gate: the engine's mechanical signal is vetted by
        # the LLM (reasoning_effort=max). CONFIRM proceeds, SKIP aborts,
        # ADJUST scales SL/TP/volume within the bot's own risk bounds.
        # Fail-open: LLM unavailability never blocks a mechanically sound
        # entry — the verdict is logged either way.
        if LLM_ADVISORY:
            advise_ctx = {
                "confidence": conf, "bid": q.get("bid"), "ask": q.get("ask"),
                "entry_price": entry_price, "sl": sl, "tp": tp, "rr": RR,
                "atr": a, "volume": vol, "open_positions": len(positions),
                "equity": eq, "day_pl": round(self.day_closed_pl, 2),
                "news": entry.get("research", []), "candles": candles,
            }
            try:
                verdict = await asyncio.wait_for(
                    asyncio.to_thread(advise, symbol, action, advise_ctx),
                    timeout=LLM_ADVISORY_TIMEOUT)
            except (asyncio.TimeoutError, TimeoutError):
                verdict = None
                entry["llm_reasoning"] = "advisor deadline exceeded (fail-open)"
            if verdict:
                entry["llm_verdict"] = verdict["verdict"]
                entry["llm_confidence"] = round(verdict["confidence"], 2)
                entry["llm_reasoning"] = verdict["reasoning"][:200]
                entry["llm_latency_s"] = verdict["latency_s"]
                if verdict["verdict"] == "SKIP":
                    entry["decision"] = "skip_llm"
                    self.log(entry)
                    return
                if verdict["verdict"] == "ADJUST":
                    sl_scale = max(0.5, min(2.0, verdict["sl_scale"]))
                    tp_scale = max(0.5, min(2.0, verdict["tp_scale"]))
                    vol_scale = max(0.5, min(1.0, verdict["volume_scale"]))
                    stop_dist *= sl_scale
                    if action == "BUY":
                        sl = entry_price - stop_dist
                        tp = entry_price + stop_dist * RR * tp_scale
                    else:
                        sl = entry_price + stop_dist
                        tp = entry_price - stop_dist * RR * tp_scale
                    vol = self.size(symbol, eq, stop_dist) * vol_scale
                    vol = max(VOL_MIN, min(VOL_MAX, round(vol, 2)))
                    entry["sl"] = round(sl, 6)
                    entry["tp"] = round(tp, 6)
                    entry["volume"] = vol
                    entry["stop_dist"] = round(stop_dist, 6)
            else:
                entry["llm_verdict"] = "UNAVAILABLE"
                entry["llm_reasoning"] = "advisor fail-open (no verdict)"

        if DRYRUN:
            entry["decision"] = "EXECUTE(dry)"
            self.log(entry)
            self.positions[symbol] = {"symbol": symbol, "side": action,
                                      "price": entry_price, "volume": vol,
                                      "stop_loss": sl, "take_profit": tp,
                                      "dry": True}
            self.hold_start[symbol] = time.monotonic()
            self.trail[symbol] = self.trail_state(sl, stop_dist)
            return

        # Retry on transient broker disconnects (mobile network drops are
        # common here; the engine reconnects with 5-30s backoff). A trade
        # that failed for infra reasons is not a rejected idea.
        res = await self.execute(symbol, action, vol, sl, tp)
        for attempt in range(1, 4):
            if res.get("status") == "filled":
                break
            msg = str(res.get("message", ""))
            if "not connected" not in msg and "reconnect" not in msg:
                break
            await asyncio.sleep(5 * attempt)
            res = await self.execute(symbol, action, vol, sl, tp)
        if res.get("status") == "filled":
            entry["decision"] = "FILLED"
            entry["detail"] = f"ticket={res.get('ticket')} pos={res.get('position_id')}"
            self.positions[symbol] = {"symbol": symbol, "side": action,
                                      "price": res.get("price") or entry_price,
                                      "volume": res.get("volume") or vol,
                                      "stop_loss": sl, "take_profit": tp,
                                      "position_id": res.get("position_id"),
                                      "ticket": res.get("ticket")}
            self.hold_start[symbol] = time.monotonic()
            self.trail[symbol] = self.trail_state(sl, stop_dist)
            self.store_trade(self.positions[symbol], "OPEN",
                             note=f"auto {action} conf={conf:.2f}")
        else:
            entry["decision"] = "FAILED"
            entry["detail"] = str(res.get("message", res))
        self.log(entry)

    def trail_state(self, sl: float, stop_dist: float) -> dict:
        return {"sl": sl, "dist": stop_dist,
                "step": stop_dist * 0.25, "gap": stop_dist * TRAIL_GAP}

    # ------------------------------------------------------------------
    # exits / management
    # ------------------------------------------------------------------
    async def close_and_log(self, symbol: str, reason: str):
        if DRYRUN:
            q = self.quotes.get(symbol)
            exit_px = 0.0
            if q and q.get("bid") and q.get("ask"):
                exit_px = (float(q["bid"]) + float(q["ask"])) / 2
            self.record_close(symbol, reason, exit_px, estimated=not exit_px)
            self.positions.pop(symbol, None)
            self.hold_start.pop(symbol, None)
            self.trail.pop(symbol, None)
            return
        res = await self.close(symbol)
        pos = self.positions.get(symbol, {})
        if res.get("status") == "closed":
            self.record_close(symbol, reason, float(res.get("price") or 0))
        else:
            self.log({"ts": utcnow(), "kind": "close", "symbol": symbol,
                      "action": reason, "decision": "FAILED",
                      "detail": str(res.get("message", res))})
            return
        self.positions.pop(symbol, None)
        self.hold_start.pop(symbol, None)
        self.trail.pop(symbol, None)

    async def on_ticker(self, t: dict):
        symbol = str(t.get("symbol", "")).upper()
        if not symbol:
            return
        # Mock ticks carry fabricated prices (the data feed fell back to the
        # mock generator) — never let them update quotes or drive trailing.
        if t.get("mock") is True:
            self.log({"ts": utcnow(), "kind": "tick", "symbol": symbol,
                      "decision": "skip_mock_tick",
                      "detail": f"mock price {t.get('price')}"})
            return
        # Only real broker feed ticks (bid AND ask present, both > 0) are
        # authoritative for quotes and trailing. Scan-loop tickers carry only
        # "price" (yfinance/mock) — letting that masquerade as bid/ask drove
        # TRADING_BAD_STOPS when the scan price diverged from the live market.
        bid = t.get("bid")
        ask = t.get("ask")
        if (bid is None or ask is None
                or float(bid) <= 0 or float(ask) <= 0):
            if symbol in self.positions:
                self.log({"ts": utcnow(), "kind": "tick", "symbol": symbol,
                          "decision": "skip_scan_tick",
                          "detail": f"price-only tick {t.get('price')}"})
            return
        self.quotes[symbol] = {"bid": bid, "ask": ask,
                               "ts": t.get("timestamp")}
        if symbol not in self.positions:
            return
        hold = self.positions[symbol]
        tr = self.trail.get(symbol)
        if not tr:
            return
        side = hold["side"]
        fbid, fask = float(bid or 0), float(ask or 0)
        mid = (fbid + fask) / 2 if fbid and fask else (fbid or fask)
        entry_px = hold.get("price") or mid
        profit = (mid - entry_px) if side == "BUY" else (entry_px - mid)
        entry = {"ts": utcnow(), "kind": "trail", "symbol": symbol,
                 "side": side, "profit": round(profit, 6),
                 "mid": round(mid, 6), "sl": round(tr["sl"], 6)}
        if profit <= tr["dist"] * TRAIL_ACTIVATE:
            return
        # Ratchet the stop: lock in the profit minus the trailing gap.
        if side == "BUY":
            new_sl = mid - tr["gap"]
            # Stale tick (price above live bid): skip, server would reject.
            if float(bid or 0) > 0 and new_sl >= float(bid):
                return
            if new_sl > tr["sl"] + tr["step"]:
                entry["decision"] = "amend"
                entry["new_sl"] = round(new_sl, 6)
                if not DRYRUN:
                    res = await self.amend(symbol, sl=new_sl)
                    if res.get("status") == "amended":
                        tr["sl"] = float(res.get("stop_loss") or new_sl)
                        hold["stop_loss"] = tr["sl"]
                        entry["detail"] = f"sl->{tr['sl']:.6f}"
                    else:
                        entry["decision"] = "amend_failed"
                        entry["detail"] = str(res.get("message", res))
                else:
                    tr["sl"] = new_sl
                    hold["stop_loss"] = new_sl
                    entry["detail"] = f"sl->{new_sl:.6f} (dry)"
                self.log(entry)
        else:
            new_sl = mid + tr["gap"]
            # Stale tick (price below live ask): skip, server would reject.
            if float(ask or 0) > 0 and new_sl <= float(ask):
                return
            if tr["sl"] - new_sl > tr["step"]:
                entry["decision"] = "amend"
                entry["new_sl"] = round(new_sl, 6)
                if not DRYRUN:
                    res = await self.amend(symbol, sl=new_sl)
                    if res.get("status") == "amended":
                        tr["sl"] = float(res.get("stop_loss") or new_sl)
                        hold["stop_loss"] = tr["sl"]
                        entry["detail"] = f"sl->{tr['sl']:.6f}"
                    else:
                        entry["decision"] = "amend_failed"
                        entry["detail"] = str(res.get("message", res))
                else:
                    tr["sl"] = new_sl
                    hold["stop_loss"] = new_sl
                    entry["detail"] = f"sl->{new_sl:.6f} (dry)"
                self.log(entry)

    async def health_check(self):
        """Every 30s: reconcile positions, time stops, daily-loss breaker."""
        positions = await self.refresh_positions()
        known = {p.get("symbol") for p in positions}
        for sym in list(self.positions):
            if sym not in known:
                # Closed by the broker (SL/TP hit) or elsewhere. The exit
                # price is unknown here; fall back to the last known stop
                # (conservative) and mark the P/L as estimated.
                hold = self.positions[sym]
                exit_px = float(hold.get("stop_loss") or 0)
                self.record_close(sym, "broker_exit", exit_px,
                                  estimated=bool(exit_px))
                self.positions.pop(sym, None)
                self.hold_start.pop(sym, None)
                self.trail.pop(sym, None)

        now = time.monotonic()
        for sym, hold in list(self.positions.items()):
            start = self.hold_start.get(sym)
            if start and (now - start) > MAX_HOLD_MIN * 60:
                await self.close_and_log(sym, "time_stop")

        self.new_day()
        eq = await self.daily_equity()
        if (self.day_start_equity and self.day_closed_pl <=
                -DAILY_LOSS_PCT * self.day_start_equity):
            self.log({"ts": utcnow(), "kind": "safety",
                      "decision": "daily_loss_breaker",
                      "detail": f"equity {eq:.2f} vs day start "
                                f"{self.day_start_equity:.2f}"})

    # ------------------------------------------------------------------
    # main loop
    # ------------------------------------------------------------------
    async def run(self):
        st = await self.status()
        info = st.get("info", {})
        print(f"[bot] broker={st.get('status')} provider={info.get('provider')} "
              f"connected={info.get('connected')} "
              f"balance={info.get('balance')} "
              f"mode={'DRY-RUN' if DRYRUN else 'LIVE'}", flush=True)
        if st.get("status") != "ok" and st.get("status") != "connected":
            print(f"[bot] WARNING broker status: {st}", flush=True)
        if self.contract_sizes:
            sample = ", ".join(f"{k}={v:g}" for k, v in
                               self.contract_sizes.items())
            print(f"[bot] contract sizes: {sample}", flush=True)
        else:
            print("[bot] contract sizes: FX 100k default (set FX_BOT_CONTRACT_SIZES "
                  "for crypto/CFD)", flush=True)

        # Seed quote cache for held symbols.
        for p in await self.refresh_positions():
            sym = p.get("symbol")
            if sym:
                self.positions[sym] = p
                self.hold_start[sym] = time.monotonic()
                if p.get("stop_loss"):
                    self.trail[sym] = self.trail_state(
                        float(p["stop_loss"]), max(float(p.get("stop_loss")) * 0.02, 0.001))

        health_task = asyncio.create_task(self.health_loop())
        try:
            while self.running and time.monotonic() < self.run_until:
                try:
                    raw = await self.sub.recv()
                except zmq.Again:
                    continue
                frame = raw.decode(errors="replace")
                try:
                    topic, payload = frame.split(" ", 1)
                    data = json.loads(payload)
                except Exception:
                    continue
                if topic == "signal":
                    await self.on_signal(data)
                elif topic == "ticker":
                    await self.on_ticker(data)
                elif topic == "notification":
                    self.log({"ts": utcnow(), "kind": "notification",
                              "detail": str(data)[:300]})
        finally:
            health_task.cancel()
        self.session_summary()
        print("[bot] stopped", flush=True)

    async def health_loop(self):
        while self.running:
            try:
                await self.health_check()
            except Exception as e:
                self.log({"ts": utcnow(), "kind": "error",
                          "detail": f"health check: {e}"})
            await asyncio.sleep(30)


async def main():
    ap = argparse.ArgumentParser(prog="trader_bot", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                    help="log decisions, never touch the broker")
    ap.add_argument("--minutes", type=float, default=60,
                    help="run for this many minutes (default 60)")
    ap.add_argument("--trades", type=int, default=0, metavar="N",
                    help="stop autonomously after N closed trades and print "
                         "a win/loss summary (0 = unlimited, default 0)")
    args = ap.parse_args()
    global DRYRUN
    if args.dry_run:
        DRYRUN = True

    with urllib.request.urlopen(f"{BRIDGE_URL}/health", timeout=5) as resp:
        h = json.loads(resp.read().decode())
    bot = TraderBot(int(h["zmq_pub"]), int(h["zmq_cmd"]))
    bot.run_until = time.monotonic() + args.minutes * 60
    bot.trades_limit = max(0, int(args.trades))
    if bot.trades_limit:
        print(f"[bot] will stop after {bot.trades_limit} closed trade(s)",
              flush=True)
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGINT, bot.stop)
    loop.add_signal_handler(signal.SIGTERM, bot.stop)
    try:
        await bot.run()
    finally:
        # ctx.term() blocks forever while sockets are open (SIGTERM leaves
        # zombie bots that would double-trade on the next run); close them
        # first, then destroy with linger 0 so shutdown never hangs.
        bot.ctx.destroy(linger=0)


if __name__ == "__main__":
    asyncio.run(main())
