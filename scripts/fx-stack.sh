#!/bin/sh
# fx-stack.sh — self-healing supervisor for the FX Analyzer stack.
#
#   fx-stack.sh status    — show engine / backend / tunnel status
#   fx-stack.sh ensure    — start anything missing (idempotent, safe to rerun)
#   fx-stack.sh watch     — loop: ensure every 20s (run detached for longevity:
#                           nohup setsid scripts/fx-stack.sh watch >/dev/null 2>&1 &)
#   fx-stack.sh stop      — stop engine, backend and the tunnel runner
#
# After a device reboot the whole stack comes back with ONE command:
#   sh <repo>/scripts/fx-stack.sh watch &
REPO=/data/data/com.termux/files/home/Fx-analyzer/Fx-analyzer
BIN=/data/data/com.termux/files/usr/bin
TUNNEL_SH="$REPO/scripts/fx-tunnel.sh"
LOG=/tmp/fx-stack.log

log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG"; }

is_up() { # $1 = url, $2 = expected substring
  curl -s -m 6 "$1" | grep -q "$2"
}

ensure_engine() {
  is_up http://127.0.0.1:8765/health '"ok"' && return 0
  log "engine DOWN — starting"
  ( cd "$REPO" && PATH="$BIN:$PATH" nohup "$REPO/.venv/bin/python" engine/bridge.py > /tmp/fx-engine.log 2>&1 & echo $! > /tmp/fx_engine.pid )
  sleep 5
}

ensure_backend() {
  is_up http://127.0.0.1:4000/api/health '"healthy"' && return 0
  log "backend DOWN — starting"
  ( cd "$REPO/backend" && PATH="$BIN:$PATH" nohup ./start.sh > /tmp/fx-backend.log 2>&1 & echo $! > /tmp/fx_backend.pid )
  sleep 5
}

ensure_tunnel() {
  # process check only: the runner self-heals the subdomain; checking the
  # public URL here would restart a healthy runner on loca.lt hiccups.
  N=$(pgrep -f 'fx-tunnel.sh' | wc -l)
  [ "$N" -ge 1 ] && return 0
  log "tunnel runner DOWN — starting"
  chmod +x "$TUNNEL_SH"
  nohup setsid "$TUNNEL_SH" >/dev/null 2>&1 &
}

status() {
  E=$(curl -s -m 5 http://127.0.0.1:8765/health)
  B=$(curl -s -m 5 http://127.0.0.1:4000/api/health)
  U=$(cat /tmp/fx-tunnel-url.txt 2>/dev/null)
  T=$(curl -s -m 8 "$U/api/health")
  echo "engine : $(echo "$E" | grep -q '"ok"' && echo UP || echo DOWN)  $E"
  echo "backend: $(echo "$B" | grep -q '"healthy"' && echo UP || echo DOWN)  $B"
  echo "tunnel : runner=$(pgrep -f 'fx-tunnel.sh' | wc -l)  public=$T"
  echo "url    : $U"
}

watch() {
  # single-instance guard: if another watcher is already looping, bow out
  if [ "$(pgrep -cf 'fx-stack.sh watch')" -gt 1 ]; then
    log "another watcher already running — exiting"
    exit 0
  fi
  log "watch started"
  while true; do
    ensure_engine
    ensure_backend
    ensure_tunnel
    sleep 20
  done
}

stop() {
  log "stop requested"
  pkill -f 'fx-tunnel.sh' 2>/dev/null
  [ -f /tmp/fx_engine.pid ]  && kill "$(cat /tmp/fx_engine.pid)"  2>/dev/null
  [ -f /tmp/fx_backend.pid ] && kill "$(cat /tmp/fx_backend.pid)" 2>/dev/null
  sleep 2
  echo "stopped. remaining:"
  pgrep -af 'bridge.py|server.js|fx-tunnel' || echo "  none"
}

case "$1" in
  status) status ;;
  ensure) ensure_engine; ensure_backend; ensure_tunnel; echo "ensure done"; status ;;
  watch)  watch ;;
  stop)   stop ;;
  *) echo "usage: $0 {status|ensure|watch|stop}"; exit 1 ;;
esac
