#!/bin/bash
# setup_vps.sh — provision a fresh Ubuntu cloud VM (Oracle Always Free / any
# Debian-Ubuntu VPS) to run the FULL FX Analyzer stack with systemd, forever.
#
# The repo is PRIVATE and contains a gitignored .env (cTrader/LLM credentials),
# so it is PUSHED from the phone over SSH — NOT cloned from GitHub.
#
#   FROM THE PHONE:
#     rsync -az --delete \
#       --exclude node_modules --exclude .venv --exclude .next \
#       --exclude __pycache__ --exclude .git \
#       -e "ssh -i ~/.ssh/id_ed25519_fx" \
#       ./ ubuntu@<VM_IP>:~/fx-analyzer
#
#   ON THE VM:
#     sudo bash ~/fx-analyzer/deploy/cloud/setup_vps.sh
#
# What it does:
#   1. Installs system deps (node, python3-venv, build tools, localtunnel).
#   2. Creates a venv and installs engine + backend dependencies.
#   3. Installs systemd units: fx-engine, fx-backend, fx-tunnel — start at
#      boot, auto-restart on crash.
#   4. Prints the public backend URL (identical to the phone's URL, so the
#      Vercel frontend needs NO changes).
set -euo pipefail

INSTALL_DIR=/home/ubuntu/fx-analyzer
APP_USER=ubuntu
WANT=fx-analyzer-backend-3

log(){ echo "[setup] $*"; }

[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo bash $0"; exit 1; }
[ -f "$INSTALL_DIR/backend/server.js" ] || {
  echo "[setup] ERROR: repo not found at $INSTALL_DIR"
  echo "[setup] push it from the phone first (see the rsync command at the top of this script)"
  exit 1
}
[ -f "$INSTALL_DIR/.env" ] || echo "[setup] WARNING: no .env found — engine/backend credentials will be missing"

log "installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl nodejs npm python3 python3-venv python3-pip build-essential >/dev/null
npm install -g localtunnel >/dev/null 2>&1 || true

cd "$INSTALL_DIR"

log "installing Python deps (engine)"
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip >/dev/null
.venv/bin/pip install -q -r engine/requirements.txt

log "installing Node deps (backend)"
( cd backend && npm install >/dev/null )

log "fixing ownership for $APP_USER"
chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"

log "writing systemd units"
mkdir -p /etc/systemd/system

cat > /etc/systemd/system/fx-engine.service <<EOF
[Unit]
Description=FX Analyzer cTrader OpenAPI engine bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/.venv/bin/python engine/bridge.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fx-backend.service <<EOF
[Unit]
Description=FX Analyzer Socket.IO + API backend
After=fx-engine.service network-online.target
Requires=fx-engine.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fx-tunnel.service <<EOF
[Unit]
Description=FX Analyzer public tunnel (loca.lt fixed subdomain)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/scripts/fx-tunnel.sh
Restart=always
RestartSec=5
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

log "starting services"
systemctl daemon-reload
systemctl enable --now fx-engine fx-backend fx-tunnel >/dev/null

log "waiting for engine"
for i in $(seq 1 45); do
  curl -s -m 3 http://127.0.0.1:8765/health | grep -q '"ok"' && break
  sleep 2
done

log "waiting for backend"
for i in $(seq 1 30); do
  curl -s -m 3 http://127.0.0.1:4000/api/health | grep -q '"healthy"' && break
  sleep 2
done

log "DONE. Local backend :4000 up."
log "Public URL (give it ~1 min to claim the subdomain): https://$WANT.loca.lt/api/health"
log "Check services: systemctl status fx-engine fx-backend fx-tunnel"
log "Logs: journalctl -u fx-engine -f   |   journalctl -u fx-backend -f"
