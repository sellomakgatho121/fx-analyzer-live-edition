#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  Fx Analyzer — Detached stack launcher (survives shell session exit)
#  Starts engine (bridge.py) + backend (server.js) fully detached via setsid.
#  Usage:  ./scripts/start_stack.sh [--status] [--stop]
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_LOG="${FX_ENGINE_LOG:-/data/data/com.termux/files/home/fx-engine.log}"
ENGINE_PID_FILE=/tmp/fx_engine.pid
BACKEND_LOG="$ROOT/backend/logs/backend.log"
BACKEND_PID_FILE=/tmp/fx_backend.pid

case "${1:-}" in
  --status)
    echo "engine: $(cat $ENGINE_PID_FILE 2>/dev/null || echo 'no pidfile')"
    [ -f "$ENGINE_PID_FILE" ] && kill -0 "$(cat $ENGINE_PID_FILE)" 2>/dev/null && echo "engine: RUNNING" || echo "engine: STOPPED"
    [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat $BACKEND_PID_FILE)" 2>/dev/null && echo "backend: RUNNING" || echo "backend: STOPPED"
    exit 0
    ;;
  --stop)
    [ -f "$ENGINE_PID_FILE" ] && kill "$(cat $ENGINE_PID_FILE)" 2>/dev/null || true
    [ -f "$BACKEND_PID_FILE" ] && kill "$(cat $BACKEND_PID_FILE)" 2>/dev/null || true
    rm -f "$ENGINE_PID_FILE" "$BACKEND_PID_FILE"
    echo "stopped"
    exit 0
    ;;
esac

cd "$ROOT"

# ── Engine (fully detached: new session, no process-group ties) ──
if [ ! -f "$ENGINE_PID_FILE" ] || ! kill -0 "$(cat $ENGINE_PID_FILE)" 2>/dev/null; then
  echo "starting engine..."
  setsid nohup .venv/bin/python engine/bridge.py >> "$ENGINE_LOG" 2>&1 < /dev/null &
  echo $! > "$ENGINE_PID_FILE"
fi

# ── Backend (Termux node required for sqlite3 addon) ──
if [ ! -f "$BACKEND_PID_FILE" ] || ! kill -0 "$(cat $BACKEND_PID_FILE)" 2>/dev/null; then
  echo "starting backend..."
  cd "$ROOT/backend"
  setsid nohup env PATH=/data/data/com.termux/files/usr/bin:$PATH node server.js >> "$BACKEND_LOG" 2>&1 < /dev/null &
  echo $! > "$BACKEND_PID_FILE"
  cd "$ROOT"
fi

echo "engine PID: $(cat $ENGINE_PID_FILE)  backend PID: $(cat $BACKEND_PID_FILE)"
