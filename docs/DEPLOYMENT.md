# Deployment Guide: FX Analyzer Pro

Deployment layout (current — single-origin):

| Piece | Where | How |
|---|---|---|
| App (static frontend + Express backend, one origin) | Render (Docker) | `Dockerfile` in this repo (`Fx-analyzer/Dockerfile`) |
| Engine (Python, ZMQ) | Same Render container (optional) and/or self-hosted | `deploy/render/start.sh` starts it in the container; the autonomous trading robot runs self-hosted (Termux / VPS) |
| Landing page | GitHub Pages | `.github/workflows/pages.yml`, source folder `docs/` |

## 1. App — Render (Docker, single origin)

The frontend is a **static export** (`frontend/out`) served by the Express
backend from the same origin as the engine + APIs — one URL, no cross-origin,
no Vercel.

- Build: Render builds `Fx-analyzer/Dockerfile` (single stage,
  `python:3.11-slim` + Node for the backend). The Next.js frontend is **not**
  built in Docker: it is exported locally and committed, keeping free-tier
  Docker builds light.
- Rebuilding the frontend after source changes:
  ```sh
  sh scripts/build-frontend.sh          # npm ci + next build -> frontend/out
  git add Fx-analyzer/frontend/out && git commit -m 'build: rebuild frontend static export'
  ```
- Entrypoint `deploy/render/start.sh`: starts the Python engine
  (`engine/bridge.py`), waits up to ~90 s for its `:8765/health`, then starts
  the backend on `:4000`. If either process dies the script exits non-zero so
  Render restarts the whole service.
- Health check: `/api/health` (backend up, SQLite connected).
- `render.yaml` documents the service as a Docker-runtime blueprint; the live
  service (`fx-analyzer-live.onrender.com`) is configured from the Render
  dashboard against the Dockerfile.

### Env vars

`backend/.env.example` lists the backend vars: `JWT_SECRET` (required, generate
with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
`API_KEY` (protects REST routes via `x-api-key`), `ZMQ_PORT` / `ZMQ_CMD_PORT`
(engine pub/command ports; the Termux device uses 5565/5566), `ENGINE_HTTP_URL`
(HTTP/SSE fallback to the engine, default `http://127.0.0.1:8765`).

Engine vars (when running in the container): `CTRADER_CLIENT_ID`,
`CTRADER_CLIENT_SECRET`, `CTRADER_ACCESS_TOKEN` (+ optional `CTRADER_ACCOUNT_ID`,
`CTRADER_DEMO`), the LLM keys used by the agents (Gemini/OpenAI), and the same
`ZMQ_*` ports. The engine raises `BrokerAuthError` without `CTRADER_*` creds.

Secrets can be set as Render env vars or **Secret Files**: the backend and the
engine load `/app/.env` and `/etc/secrets/.env` on top of real env vars
(real env vars always win).

### Engine on Render

`deploy/render/start.sh` starts `bridge.py` inside the container, so with the
creds above set the app can serve real engine data (scans, candles, signals)
from Render itself. Without them the backend still serves the UI/APIs and
degrades gracefully (e.g. `/api/candles/:symbol` → 502 "Engine Unreachable").

> ⚠️ The **autonomous trading robot** (`scripts/trader_bot.py`) must run
> self-hosted, not inside the Render container — two engines commanding the
> same cTrader account would conflict.

## 2. Engine — Self-hosted (the trading robot)

The live trading setup: engine + `trader_bot.py` on the Android (Termux)
device; see `HANDOFF.md` for the operational playbook (restart procedure,
smoke test, known traps).

### Linux / VPS (systemd)

```ini
# /etc/systemd/system/fx-engine.service
[Unit]
Description=FX Analyzer Python engine
After=network.target

[Service]
WorkingDirectory=/opt/Fx-analyzer/engine
ExecStart=/opt/Fx-analyzer/engine/.venv/bin/python bridge.py
Environment=ZMQ_PORT=5555
Environment=ZMQ_CMD_PORT=5556
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Termux (Android)

```sh
cd ~/Fx-analyzer/engine
.venv/bin/python bridge.py        # live device: ZMQ_PORT=5565 ZMQ_CMD_PORT=5566 (via engine env file)
```

### Broker adapters

`engine/broker/` implements a single `BrokerAdapter` contract:

- `CtraderBrokerAdapter` — live execution on cTrader Open API (demo). Needs
  `CTRADER_CLIENT_ID` / `CTRADER_CLIENT_SECRET` / `CTRADER_ACCESS_TOKEN`.
- `MockBrokerAdapter` — paper trading (no creds needed).

MetaTrader 5 support was removed from the stack.

## 3. Local development

```sh
# 1. Engine (Termux/Linux)
cd engine && .venv/bin/python bridge.py

# 2. Backend
cd backend && npm install && cp .env.example .env && node server.js   # :4000

# 3. Frontend
cd frontend && npm install && npm run build && npm run start          # :3000
```

Open `http://localhost:3000`; the landing page is mirrored statically at
`docs/index.html`.

## 4. CI

- `.github/workflows/ci.yml` — on push/PR to `main`: frontend lint+build,
  backend `node --test` (rate-limit suite) + syntax check, engine `py_compile`.
- `.github/workflows/docker-build-check.yml` — reproduces the Render Docker
  build (`docker build -f Fx-analyzer/Dockerfile Fx-analyzer/`) on every push
  so build failures surface in GitHub Actions.
