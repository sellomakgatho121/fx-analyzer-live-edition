#!/bin/sh
# fx-tunnel.sh — persistent localtunnel to the backend (:4000) with a FIXED
# subdomain so the public URL never rotates. Self-heals: if loca.lt hands out
# a random subdomain, it kills lt and retries until the wanted one is granted.
# Restart it with:  nohup setsid scripts/fx-tunnel.sh >/dev/null 2>&1 &
REPO=/data/data/com.termux/files/home/Fx-analyzer/Fx-analyzer
LT="$REPO/frontend/node_modules/.bin/lt"
# On the cloud VM the repo lives elsewhere and lt is installed globally.
[ -x "$LT" ] || LT=$(command -v lt 2>/dev/null)
[ -n "$LT" ] || { echo "ERROR: lt (localtunnel) client not found"; exit 1; }
URL_FILE=/tmp/fx-tunnel-url.txt
LOG=/tmp/fx-tunnel.log
WANT=fx-analyzer-backend-3

log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }

log "runner started (want subdomain: $WANT)"
while true; do
  "$LT" --port 4000 --subdomain "$WANT" > /tmp/fx-tunnel.out 2>&1 &
  LT_PID=$!
  # wait for the printed url
  GOT=""
  for i in $(seq 1 25); do
    GOT=$(grep -oE 'https://[a-z0-9-]+\.loca\.lt' /tmp/fx-tunnel.out 2>/dev/null | head -1)
    [ -n "$GOT" ] && break
    sleep 1
  done
  if [ -n "$GOT" ]; then
    echo "$GOT" > "$URL_FILE"
    case "$GOT" in
      *"$WANT"*)
        log "tunnel up: $GOT"
        ;;
      *)
        log "WARN: got $GOT (not $WANT) — killing lt to retry"
        kill "$LT_PID" 2>/dev/null
        sleep 5
        continue
        ;;
    esac
  else
    log "no url printed within 25s — killing lt"
    kill "$LT_PID" 2>/dev/null
    sleep 5
    continue
  fi
  wait "$LT_PID" 2>/dev/null
  log "lt exited rc=$? — restarting in 5s"
  sleep 5
done
