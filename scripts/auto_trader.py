#!/usr/bin/env python3
"""auto_trader — signal-driven auto-execution bot for FX Analyzer Pro.

Subscribes to the engine's PUB socket ("signal" topic), the same signals the
dashboard shows (technical scan -> MoE consensus), and executes market orders
through the broker when a signal clears every guardrail.

Guardrails (env-overridable):
  FX_BOT_MIN_CONFIDENCE  skip signals below this confidence   (default 0.60)
  FX_BOT_MAX_POSITIONS   refuse new entries past this many    (default 3)
  FX_BOT_COOLDOWN_MIN    per-symbol re-entry cooldown         (default 15)
  FX_BOT_VOLUME          lot size per trade                   (default 0.01)
  FX_BOT_SYMBOLS         comma-separated allowlist            (default: all)
  FX_BOT_DRYRUN          "1" logs decisions but never trades  (default: off)
  FX_HTTP_URL            bridge to read live port config      (default :8765)

Usage:
  .venv/bin/python scripts/auto_trader.py [--dry-run] [--once]

Every decision is appended to data/auto_trade_log.jsonl and executions are
recorded in the engine database (trades table).
"""
import argparse
import json
import os
import signal as os_signal
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import zmq

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from engine import database  # noqa: E402

DB_PATH = os.environ.get("FX_DB", str(REPO_ROOT / "fx_analyzer.db"))

LOG_PATH = REPO_ROOT / "data" / "auto_trade_log.jsonl"
BRIDGE_URL = os.environ.get("FX_HTTP_URL", "http://127.0.0.1:8765")

MIN_CONFIDENCE = float(os.environ.get("FX_BOT_MIN_CONFIDENCE", 0.60))
MAX_POSITIONS = int(os.environ.get("FX_BOT_MAX_POSITIONS", 3))
COOLDOWN_MIN = float(os.environ.get("FX_BOT_COOLDOWN_MIN", 15))
VOLUME = float(os.environ.get("FX_BOT_VOLUME", 0.01))
ALLOWED = [s.upper() for s in os.environ.get("FX_BOT_SYMBOLS", "").split(",") if s]
DRYRUN = os.environ.get("FX_BOT_DRYRUN", "0") == "1"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def bridge_ports() -> tuple[int, int]:
    """Ask the engine bridge which ZMQ ports are live (single source of truth)."""
    try:
        with urllib.request.urlopen(f"{BRIDGE_URL}/health", timeout=5) as resp:
            h = json.loads(resp.read().decode())
        return int(h["zmq_pub"]), int(h["zmq_cmd"])
    except Exception as e:
        sys.exit(f"error: engine unreachable at {BRIDGE_URL}: {e}")


class AutoTrader:
    def __init__(self, pub_port: int, cmd_port: int):
        self.ctx = zmq.Context()
        self.sub = self.ctx.socket(zmq.SUB)
        self.sub.setsockopt(zmq.SUBSCRIBE, b"signal")
        self.sub.setsockopt(zmq.RCVTIMEO, 5000)
        self.sub.connect(f"tcp://127.0.0.1:{pub_port}")
        self.rep = self.ctx.socket(zmq.REQ)
        self.rep.setsockopt(zmq.LINGER, 0)
        # Engine commands hold the REP for 30s+ while awaiting broker
        # execution events; a shorter recv timeout breaks the REQ state
        # machine (resend after a timed-out recv raises EFSM).
        self.rep.setsockopt(zmq.RCVTIMEO, 90000)
        self.rep.connect(f"tcp://127.0.0.1:{cmd_port}")
        self.cmd_port = cmd_port
        self.last_entry: dict[str, float] = {}
        self.running = True

    def stop(self, *_):
        self.running = False

    def _req(self, payload: dict, retries: int = 3) -> dict:
        """Send a command with retries — the engine's REP socket processes one
        command at a time and answers 'Try again' while busy (e.g. mid-scan)."""
        for attempt in range(1, retries + 1):
            try:
                self.rep.send_json(payload)
                res = self.rep.recv_json()
                if isinstance(res, dict) and res.get("message") == "Try again":
                    time.sleep(2 * attempt)
                    continue
                return res
            except zmq.Again:
                # A REQ socket is stuck after a timed-out recv; rebuild it
                # before retrying, or the next send raises EFSM.
                self._rebuild_req()
                time.sleep(2 * attempt)
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

    def broker_status(self) -> dict:
        return self._req({"cmd": "MT5_STATUS"})

    def open_positions(self) -> list:
        res = self._req({"cmd": "BROKER_POSITIONS"})
        if isinstance(res, dict) and isinstance(res.get("positions"), list):
            return res["positions"]
        if isinstance(res, list):
            return res
        return []

    def execute(self, symbol: str, action: str) -> dict:
        return self._req({
            "cmd": "EXECUTE_TRADE",
            "symbol": symbol,
            "action": action.lower(),
            "volume": VOLUME,
            "comment": "auto-trader signal",
        })

    def log(self, entry: dict):
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a") as f:
            f.write(json.dumps(entry, default=str) + "\n")
        line = (
            f"[{entry['ts']}] {entry['signal_id']} {entry['symbol']} "
            f"{entry['action']} conf={entry['confidence']:.2f} -> "
            f"{entry['decision']}"
        )
        print(line, flush=True)
        if entry.get("detail"):
            print(f"    {entry['detail']}", flush=True)

    def decide(self, sig: dict) -> tuple[str, str]:
        """Return (decision, detail). Decision: EXECUTE | SKIP | HOLD | BLOCK."""
        action = str(sig.get("action", "HOLD")).upper()
        symbol = str(sig.get("symbol", "?")).upper()
        conf = float(sig.get("confidence", 0) or 0)

        # Fail closed: only signals derived from live cTrader data may be
        # executed. Signals without an explicit cTrader source are blocked.
        if sig.get("data_source") != "ctrader":
            return "BLOCK", (f"signal data_source={sig.get('data_source')!r} "
                             "is not 'ctrader' — no live data")
        if action not in ("BUY", "SELL"):
            return "HOLD", f"signal action is {action}"
        if conf < MIN_CONFIDENCE:
            return "SKIP", f"confidence {conf:.2f} < min {MIN_CONFIDENCE:.2f}"
        if ALLOWED and symbol not in ALLOWED:
            return "SKIP", f"{symbol} not in allowlist {ALLOWED}"
        if symbol in self.last_entry:
            since = time.time() - self.last_entry[symbol]
            if since < COOLDOWN_MIN * 60:
                return "SKIP", (f"re-entry cooldown {since/60:.1f}min < "
                                f"{COOLDOWN_MIN}min")

        positions = self.open_positions()
        if len(positions) >= MAX_POSITIONS:
            return "BLOCK", f"{len(positions)} positions >= max {MAX_POSITIONS}"
        return "EXECUTE", "all guardrails passed"


def main():
    ap = argparse.ArgumentParser(prog="auto_trader", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="log decisions, never trade")
    ap.add_argument("--once", action="store_true", help="exit after first signal")
    args = ap.parse_args()
    dry = args.dry_run or DRYRUN

    pub, cmd_port = bridge_ports()
    bot = AutoTrader(pub, cmd_port)
    os_signal.signal(os_signal.SIGINT, bot.stop)
    os_signal.signal(os_signal.SIGTERM, bot.stop)

    mode = "DRY-RUN" if dry else "LIVE"
    print(f"[bot] {mode}  pub={pub} cmd={cmd_port}  min_conf={MIN_CONFIDENCE} "
          f"max_pos={MAX_POSITIONS} cooldown={COOLDOWN_MIN}min vol={VOLUME} "
          f"symbols={ALLOWED or 'all'}", flush=True)

    # Verify broker is reachable before entering the loop.
    st = bot.broker_status()
    info = st.get("info", {})
    if st.get("status") != "ok":
        print(f"[bot] WARNING broker status: {st}", flush=True)
    else:
        print(f"[bot] broker {info.get('provider')}/{info.get('mode')} "
              f"connected={info.get('connected')} balance={info.get('balance')}", flush=True)

    while bot.running:
        try:
            raw = bot.sub.recv()
        except zmq.Again:
            continue
        frame = raw.decode(errors="replace")
        try:
            topic, payload = frame.split(" ", 1)
            sig = json.loads(payload)
        except Exception as e:
            print(f"[bot] bad frame {frame[:200]}: {e}", flush=True)
            continue

        decision, detail = bot.decide(sig)
        entry = {
            "ts": now(),
            "signal_id": sig.get("id"),
            "symbol": str(sig.get("symbol", "?")).upper(),
            "action": str(sig.get("action", "HOLD")).upper(),
            "confidence": float(sig.get("confidence", 0) or 0),
            "price": sig.get("price"),
            "decision": decision,
            "detail": detail,
        }

        if decision == "EXECUTE":
            if dry:
                entry["decision"] = "EXECUTE(dry)"
                bot.log(entry)
            else:
                res = bot.execute(entry["symbol"], entry["action"])
                if res.get("status") == "filled":
                    entry["decision"] = "FILLED"
                    entry["detail"] = f"ticket={res.get('ticket')} position_id={res.get('position_id')}"
                    bot.last_entry[entry["symbol"]] = time.time()
                    try:
                        database.store_trade({
                            "symbol": entry["symbol"],
                            "action": entry["action"],
                            # Real fill price from the broker, never the
                            # signal's (stale) price.
                            "entry_price": res.get("price"),
                            "status": "OPEN",
                            "timestamp": entry["ts"],
                        })
                    except Exception as e:
                        entry["detail"] += f" (db log failed: {e})"
                else:
                    entry["decision"] = "FAILED"
                    entry["detail"] = str(res.get("message", res))
                bot.log(entry)
        else:
            bot.log(entry)

        if args.once:
            bot.running = False

    print("[bot] stopped", flush=True)


if __name__ == "__main__":
    main()
