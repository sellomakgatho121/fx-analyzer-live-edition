# FX Analyzer Pro

**Institutional-grade algorithmic FX trading terminal** powered by Google Gemini AI with a Mixture of Experts architecture.

[![CI Status](https://github.com/sellomakgatho121/Fx-analyzer/actions/workflows/ci.yml/badge.svg)](https://github.com/sellomakgatho121/Fx-analyzer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://sellomakgatho121.github.io/Fx-analyzer)
[![Vercel](https://img.shields.io/badge/deployed-vercel-000?logo=vercel)](https://frontend-jjh4l1mja-sellomakgatho121-2317s-projects.vercel.app)

---

## Overview

FX Analyzer Pro is a full-stack algorithmic trading platform where **four specialized AI agents** (Technical, Fundamental, Sentiment, Risk) analyze the forex market, debate their findings, and deliver high-conviction trading signals through a risk-shielded broker adapter layer — paper trading by default, with cTrader live and MetaTrader 5 reachable via the same adapter contract on Windows.

**Live landing page**: [sellomakgatho121.github.io/Fx-analyzer](https://sellomakgatho121.github.io/Fx-analyzer)  
**Live app** (Vercel): [Launch Terminal](https://frontend-jjh4l1mja-sellomakgatho121-2317s-projects.vercel.app)

## Features

### 🔬 Mixture of Experts AI
- **4 LLM agents** — Technical, Fundamental, Sentiment, Risk — using Google Gemini Flash
- **MM-DREX architecture**: agents debate then synthesize into a unified signal
- Regime-adaptive weighting shifts based on live market volatility

### ⚡ Real-Time Execution
- ZeroMQ pub/sub for Python ↔ Node.js bridge (sub-second latency)
- Socket.IO for live frontend updates
- Broker adapter layer: paper trading (MockBrokerAdapter), cTrader (env-gated), MT5 via the same contract on Windows

### 🛡️ Risk Management
- Configurable daily drawdown limits
- Max position caps per pair
- Emergency kill switch
- Paper trading engine with full simulation

### 🎨 Premium Dashboard
- Next.js 16 with TailwindCSS 4
- Framer Motion animations & Three.js 3D scenes
- Real-time candlestick charts (light-weight-charts)
- Dark neon "Deep Neo" design system

## Architecture

```
┌──────────────────────────────┐
│     FRONTEND (Next.js 16)    │
│  TailwindCSS4 · Framer Motion │
│  Three.js · Socket.IO Client │
└──────────┬───────────────────┘
           │ Socket.IO (WebSocket)
┌──────────▼───────────────────┐
│     BACKEND (Node.js)         │
│  Express · Socket.IO · SQLite │
│  Auth · CORS · Rate Limiting │
└──────────┬───────────────────┘
           │ ZeroMQ (TCP)
┌──────────▼───────────────────┐
│     ENGINE (Python 3.11+)     │
│  MoE Orchestrator · TA Lib    │
│  Gemini API · Sentiment · Broker Adapters │
│  Vibe Research · Deep Agents (CNN/LSTM) │
└──────────────────────────────┘
```

## Tech Stack

| Layer     | Technology                                |
|-----------|-------------------------------------------|
| Frontend  | Next.js 16, TailwindCSS 4, Framer Motion, Three.js, Zustand |
| Backend   | Node.js, Express, Socket.IO, SQLite, JWT  |
| Engine    | Python 3.11+, Google Gemini, ZeroMQ, Pandas, Torch (CNN/LSTM), RAG, Broker adapters |
| Database  | SQLite (signals, trades, user sessions)   |
| CI/CD     | GitHub Actions, GitHub Pages, Vercel      |

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Google Gemini API key

### 1. Clone & Install
```bash
git clone https://github.com/sellomakgatho121/Fx-analyzer.git
cd Fx-analyzer/Fx-analyzer

# Frontend
cd frontend && npm install

# Backend
cd ../backend && npm install

# Python engine
cd ..
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r engine/requirements.txt
```

### 2. Set Environment
```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Run
```bash
# Windows (all services):
.\start.ps1

# Or individually:
cd backend && npm start            # Port 4000
cd frontend && npm run dev         # Port 3000
python engine/bridge.py            # Engine
```

## Engine & Backend Runtime

On the live device the stack runs as three separate processes:

| Service | Start command | Endpoints / ports |
|---|---|---|
| Python engine | `source <engine env file>` then `nohup .venv/bin/python engine/bridge.py` | ZMQ PUB `tcp://127.0.0.1:5565`, ZMQ REP CMD `tcp://127.0.0.1:5566`, HTTP bridge `http://127.0.0.1:8765` |
| Backend (Node) | `cd backend && node server.js` | `http://127.0.0.1:4000` |
| Frontend (Next.js) | `cd frontend && npm run build -- --webpack && npm run start` | `http://localhost:3000` |

Engine details:

- The engine env (Gemini/OpenAI keys, ZMQ ports) is sourced from an env file
  before launch — `/tmp/fx_engine_env.txt` on this device — then started with
  `nohup .venv/bin/python engine/bridge.py`. PID file: `/tmp/fx_engine.pid`;
  log: `~/fx-engine.log` (timestamps SAST, +2h vs UTC).
- ZMQ ports 5565/5566 are the live values set via env (`ZMQ_PORT` /
  `ZMQ_CMD_PORT`); the engine code defaults to 5555/5556 (`engine/bridge.py`)
  and both are overridable.
- HTTP bridge (`http://127.0.0.1:8765`, `engine/http_bridge.py`):
  - `GET /health` — liveness probe (reports the live ZMQ pub/cmd ports)
  - `POST /cmd` — engine commands (`MT5_STATUS`, `EXECUTE_TRADE`,
    `GET_CANDLES`, ...) as JSON
  - `GET /events` — SSE stream of engine events (`ticker`, `signal`,
    `vibe-research`, `notification`, `positions`)

The Node backend runs in **HTTP/SSE bridge mode**: it tries to
`require('zeromq')` and, when the native addon cannot be built (e.g.
Android/Termux), falls back to the engine's HTTP bridge (`ENGINE_HTTP_URL`) —
POST `/cmd` for commands, GET `/events` for the event stream. This degraded
mode is by design. Socket.IO events currently emitted by the backend:
`ticker-update`, `signal-history`, `fx-signal` (premium), `trade-executed`,
`trade-rejected`, `positions-update`, `risk-stats-update`,
`risk-settings-updated`, `llm-models-list`, `model-changed`,
`mt5-status` / `broker-status`, `vibe-research-update`, `notification`,
`analysis:result`.

## Trading Scripts & CLI

All trading scripts live in `scripts/` and talk to the running engine via the
HTTP bridge (default `http://127.0.0.1:8765`, overridable with `FX_HTTP_URL`):

- **`fx.py`** — stdlib-only CLI for the engine (no third-party deps).
  Subcommands: `status`, `models`, `model <name>`, `candles <SYMBOL>
  [--limit N]`, `analyze "<query>" [--agents a,b,c] [--rounds N]
  [--risk-rounds N]`, `trade <SYMBOL> <buy|sell> [--volume] [--sl] [--tp]`,
  `close --symbol <SYMBOL> | --position-id <ID> [--volume]`,
  `amend --position-id <ID> [--sl] [--tp]`, `positions`, `orders`,
  `signals [--limit N]`, `brief`, `watch [--topics signal,ticker]`.
  Run with `.venv/bin/python scripts/fx.py <cmd>`.
- **`trader_bot.py`** — the autonomous trading bot. Subscribes to engine
  `signal` / `ticker` / `notification` events, filters entries by confidence,
  sizes by ATR-based risk (RISK_PCT of equity, volume 0.01–0.10), places SL/TP
  at RR 2:1, trails via `AMEND_TRADE`, exits on reversal / max-hold / daily
  loss. Env config: `FX_BOT_MIN_CONFIDENCE` (default 0.45),
  `FX_BOT_MAX_POSITIONS` (3), `FX_BOT_RISK_PCT` (0.5), `FX_BOT_RR` (2.0),
  `FX_BOT_TRAIL_ACTIVATE` (0.5), `FX_BOT_TRAIL_GAP` (0.8),
  `FX_BOT_MAX_HOLD_MIN` (240), `FX_BOT_DAILY_LOSS_PCT` (2.0),
  `FX_BOT_SYMBOLS` (comma-separated allowlist, empty = all), `FX_BOT_DRYRUN`.
  Every decision is appended as a JSON line to `data/trader_log.jsonl`.
  Run: `.venv/bin/python scripts/trader_bot.py [--dry-run]`.
- **`auto_trader.py`** — simpler signal-follower (guardrails only).
- **`run_trader.sh`** — launcher for `trader_bot.py`
  (`scripts/run_trader.sh [--dry-run]`).
- **`watch_and_trade.py`** — watches the engine log for a fresh
  "cTrader connected" line, then fires `EXECUTE_TRADE` (workaround for the
  flaky mobile network).
- **`test_trader_flow.py`** — smoke test driving the bot's real
  entry → trail → close flow against the live demo broker with a synthetic
  signal (supports `--dry-run`).

Broker note: the engine trades through the **cTrader Open API (demo account)**;
the adapter auto-reconnects when the mobile network drops. MT5 is no longer a
target platform (see `build-roadmap.md`).

## Deployment

| Service  | Platform | Config                                      |
|----------|----------|---------------------------------------------|
| Landing  | GitHub Pages | Auto-deploy from `/docs` on push to `main` |
| Frontend | Vercel   | Connect repo, set `root: frontend`          |
| Backend  | Render   | `render.yaml` config in repo root           |
| Engine   | Self-host | Python service on VPS or local machine     |

## Project Structure

```
Fx-analyzer/
├── frontend/        # Next.js 16 web application
│   ├── src/
│   │   ├── app/     # Pages & API routes
│   │   ├── components/  # React components
│   │   ├── store/   # Zustand state
│   │   └── lib/     # Utilities & hooks
│   └── package.json
├── backend/         # Node.js API server
│   ├── server.js    # Express + Socket.IO
│   └── package.json
├── engine/          # Python analysis engine
│   ├── bridge.py    # ZMQ ↔ Node.js bridge
│   ├── deep/        # Deep learning agents
│   └── trading_agents/  # MCP-based agents
├── docs/            # Docs + GitHub Pages landing
├── backend/.env.example   # Env template (JWT, API key, ZMQ ports)
└── engine/data/     # Market data cache & research corpus
```

## Documentation

- [Product Requirements](docs/PRD.md)
- [Project Structure](docs/Project_Structure.md)
- [UI/UX Design System](docs/UI_UX_System.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License — see [LICENSE](LICENSE).
