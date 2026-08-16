#!/bin/sh
# FX Analyzer backend launcher.
#
# Usage:
#   ./start.sh [env-file]
#
#   env-file   optional env file to source; defaults to ../.env (project
#              root) when present.
#
# Waits for the Python engine health endpoint (up to ~30s), warns if the
# engine is down (the backend still starts — it degrades gracefully), then
# execs `node server.js`. After exec, TERM/INT go straight to node, whose
# own SIGTERM/SIGINT handlers close the HTTP server, Socket.IO and the
# SQLite DB (see server.js "Graceful Shutdown").
#
# NOTE (Termux/proot): the backend MUST run under the Termux node — the
# PRoot /usr/bin/node cannot load the Termux-built sqlite3 addon
# (ERR_DLOPEN_FAILED / liblog.so missing). Launch with:
#     PATH=/data/data/com.termux/files/usr/bin:$PATH ./start.sh

# Optional env file: source it if given (or ../.env when present).
ENV_FILE="${1:-../.env}"

if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set +u
    . "$ENV_FILE"
    set -u
    echo "Loaded env file: $ENV_FILE"
fi

# Engine health endpoint (ENGINE_HTTP_URL from env, or the local default).
ENGINE_HTTP_URL="${ENGINE_HTTP_URL:-http://127.0.0.1:8765}"
ENGINE_HTTP_URL="${ENGINE_HTTP_URL%/}"
ENGINE_HEALTH_URL="${ENGINE_HTTP_URL}/health"

# Extract host/port from the URL for the no-curl /dev/tcp fallback.
ENGINE_HOST_PORT="${ENGINE_HTTP_URL#*://}"
ENGINE_HOST_PORT="${ENGINE_HOST_PORT%%/*}"
ENGINE_PORT="${ENGINE_HOST_PORT##*:}"
case "$ENGINE_PORT" in
    ''|*[!0-9]*) ENGINE_PORT=8765 ;;
    *) ENGINE_HOST="${ENGINE_HOST_PORT%%:*}" ;;
esac

# Abort the engine wait promptly if the launcher itself is interrupted.
trap 'echo "start.sh: interrupted — exiting."; exit 1' INT TERM

engine_up() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsS --max-time 2 "$ENGINE_HEALTH_URL" >/dev/null 2>&1
    else
        # Port-open check; requires bash's /dev/tcp (dash does not have it).
        (exec 3<>"/dev/tcp/$ENGINE_HOST/$ENGINE_PORT") 2>/dev/null
    fi
}

echo "Waiting for engine at $ENGINE_HEALTH_URL ..."
engine_ok=0
i=0
while [ "$i" -lt 30 ]; do
    if engine_up; then
        echo "Engine is up — starting FX Analyzer backend."
        engine_ok=1
        break
    fi
    i=$((i + 1))
    sleep 1
done

if [ "$engine_ok" -eq 0 ]; then
    echo "WARNING: engine did not respond at $ENGINE_HEALTH_URL within 30s." >&2
    echo "         Starting backend anyway — live data will be unavailable until the engine comes up." >&2
fi

exec node server.js
