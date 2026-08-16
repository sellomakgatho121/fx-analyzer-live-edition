"""Watch the engine log for a fresh cTrader connect, then fire EXECUTE_TRADE.

The cTrader link on this mobile network flaps (DNS blips, handshake
timeouts, server-silence drops), so we fire the trade in the same second
the engine logs a new "cTrader connected" line. Retries across windows.

The trade itself is NOT hardcoded — it comes from env:
  WATCH_SYMBOL   required, e.g. EURUSD
  WATCH_ACTION   optional, BUY|SELL (default BUY)
  WATCH_VOLUME   optional, lots (default 0.01)
"""
import json
import os
import sys
import time
import zmq

LOG = "/data/data/com.termux/files/usr/tmp/engine_trade2.log"
REP_ENDPOINT = "tcp://127.0.0.1:5566"
CONNECT_MARK = "cTrader connected: demo1.p.ctrader.com"

WATCH_SYMBOL = os.environ.get("WATCH_SYMBOL", "").strip().upper().replace("/", "")
WATCH_ACTION = os.environ.get("WATCH_ACTION", "BUY").strip().upper()
WATCH_VOLUME = float(os.environ.get("WATCH_VOLUME", "0.01"))

MAX_WINDOWS = 10
LOG_POLL = 2.0
REP_TIMEOUT_MS = 20000


def last_connect_ts():
    """Return (unix_ts, line) of the newest connect marker in the log, else (0, None)."""
    latest = (0, None)
    try:
        with open(LOG, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            # read last 64KB only
            f.seek(max(0, size - 65536))
            for raw in f.read().splitlines():
                line = raw.decode(errors="replace")
                if CONNECT_MARK in line:
                    # line format: "2026-08-06 17:24:41,516 - INFO - cTrader connected: ..."
                    ts = line.split(" - ")[0].strip().replace(",", ".")
                    try:
                        unix = time.mktime(time.strptime(ts, "%Y-%m-%d %H:%M:%S"))
                    except ValueError:
                        continue
                    if unix > latest[0]:
                        latest = (unix, line)
    except FileNotFoundError:
        pass
    return latest


def fire_trade(ctx):
    trade = {
        "cmd": "EXECUTE_TRADE",
        "symbol": WATCH_SYMBOL,
        "action": WATCH_ACTION.lower(),
        "volume": WATCH_VOLUME,
    }
    sock = ctx.socket(zmq.REQ)
    sock.setsockopt(zmq.LINGER, 0)
    sock.connect(REP_ENDPOINT)
    try:
        sock.send_json(trade)
        poller = zmq.Poller()
        poller.register(sock, zmq.POLLIN)
        events = dict(poller.poll(REP_TIMEOUT_MS))
        if sock in events:
            reply = sock.recv_json()
            print(f"[trade] reply: {json.dumps(reply)}", flush=True)
            return reply
        print("[trade] no reply within 20s", flush=True)
        return None
    except zmq.ZMQError as e:
        print(f"[trade] zmq error: {e}", flush=True)
        return None
    finally:
        sock.close()


def main():
    if not WATCH_SYMBOL:
        print("[watch] WATCH_SYMBOL env is required (e.g. WATCH_SYMBOL=EURUSD)", flush=True)
        return 2
    ctx = zmq.Context()
    sent_in_window = 0  # unix ts of last window we fired in
    attempts = 0
    print(f"[watch] started; watching for a cTrader connect window "
          f"to trade {WATCH_SYMBOL} {WATCH_ACTION} {WATCH_VOLUME} lot...", flush=True)
    while attempts < MAX_WINDOWS:
        ts, line = last_connect_ts()
        if ts and ts != sent_in_window:
            sent_in_window = ts
            attempts += 1
            print(f"[watch] window #{attempts} detected: {line}", flush=True)
            reply = fire_trade(ctx)
            # Fail closed: only a real cTrader fill counts. The engine
            # never reports mock_filled for the live provider.
            if reply and reply.get("status") == "filled":
                print("[watch] TRADE FILLED", flush=True)
                ctx.term()
                return 0
            if reply:
                print(f"[watch] not filled yet: {reply.get('status')}", flush=True)
        time.sleep(LOG_POLL)
    print("[watch] gave up after 10 windows", flush=True)
    ctx.term()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
