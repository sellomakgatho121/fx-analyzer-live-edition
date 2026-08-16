#!/bin/sh
# Render entrypoint: run the Python engine and the Node backend in one
# container.
#
# The engine REQUIRES its env (CTRADER_* creds etc. — see docs/DEPLOYMENT.md)
# and fails loudly at boot without it. In that case — or if it dies later —
# the backend keeps serving alone: the UI degrades gracefully (e.g.
# /api/candles -> 502 "Engine Unreachable") instead of the whole service
# crash-looping. When the engine IS healthy, either process dying tears the
# container down so Render restarts both (self-healing; the engine reconnects
# to cTrader on its own cycle).
set -e

echo "[render] starting engine (bridge.py)"
python engine/bridge.py &
ENGINE_PID=$!
ENGINE_HEALTHY=0

# Wait for the engine's HTTP bridge to come up (it is the data source; the
# backend degrades gracefully without it, but we want a clean start).
for i in $(seq 1 45); do
    if curl -s -m 2 http://127.0.0.1:8765/health | grep -q '"ok"'; then
        echo "[render] engine healthy"
        ENGINE_HEALTHY=1
        break
    fi
    if ! kill -0 "$ENGINE_PID" 2>/dev/null; then
        echo "[render] engine exited before becoming healthy — continuing without it"
        break
    fi
    sleep 2
done

echo "[render] starting backend on :$PORT"
cd backend && exec node server.js &
NODE_PID=$!

if [ "$ENGINE_HEALTHY" = "1" ]; then
    # Block until either child exits, then tear down and let Render restart us.
    # POSIX sh has no `wait -n` (dash), so poll both PIDs instead.
    while kill -0 "$ENGINE_PID" 2>/dev/null && kill -0 "$NODE_PID" 2>/dev/null; do
        sleep 2
    done
    kill "$ENGINE_PID" "$NODE_PID" 2>/dev/null || true
    echo "[render] a service process exited — restarting"
    exit 1
else
    # Engine never became healthy: serve the backend alone (no crash loop).
    wait "$NODE_PID"
fi
