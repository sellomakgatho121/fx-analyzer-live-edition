# Project Structure: FX Analyzer Pro

## System Topology
```mermaid
graph TD
    UI[Next.js Frontend :3000] <-->|Socket.IO| API[Node.js Backend :4000]
    API <-->|ZMQ PUB/REQ| Engine[Python Engine]
    Engine <--> Data[yfinance / Broker adapters]
    Engine <--> LLM[Gemini Flash API]
    Engine <--> DB[(sqlite: fx_analyzer.db)]
    UI <-->|REST /api/* (JWT, rate-limited)| API
```

## Directory Layout
- `/docs` — Documentation (this PRD, project structure, UI/UX system) + static
  GitHub Pages landing (`index.html`, `.nojekyll`)
- `/frontend` — Next.js web application (App Router)
  - `/src/app` — routes: landing, auth (login/register), main app shell
    (dashboard, trading, signals, analytics, risk, models, agent arena, vibe)
  - `/src/components` — UI units (charts, signal cards, trade panel, 3D arena,
    agent arena, risk panel, chat/terminal, theme)
  - `/src/lib` — Socket.IO event bus (`socketEventBus.js`), paper-trading
    helpers, alert service, theme
  - `/src/store` — zustand stores (session, trading, analysis, agent, UI)
- `/backend` — Node.js/Express/Socket.IO server (port 4000)
  - `server.js` — app + sockets: REST `/api/*` (auth, signals, analytics,
    risk, models, vibe, broker), ZMQ pub/sub to engine, rate limiting
  - `auth.js` — JWT + bcrypt credential flows
  - `tests/` — node:test suite (rate-limit verification)
- `/engine` — Python core (see module map below), `.venv`-scoped
  - `bridge.py` — ZMQ command/event bridge (framing, normalize_symbol)
  - `orchestrator.py` — signal pipeline + RAG-grounded LLM context
  - `data_feed.py` / `cache.py` — yfinance ingestion + DiskCache (TTL)
  - `database.py` — sqlite schema + migrations (vibe_research.source, …)
  - `vibe_research_service.py` — native backtest + factor alpha bench
  - `agents/` — technical, sentiment, fundamental, risk agents
  - `deep/` — CNN pattern agent (checkpoints/), LSTM agent, sentiment analyzer
  - `rag/` — TF-IDF retriever, loader, RSS loader, store
  - `broker/` — adapter base + MockBrokerAdapter (paper) + CtraderBrokerAdapter
  - `trading_agents/` — research→analyst→manager→risk workflow orchestration
  - `tests/` — pytest suite (protocol, symbols, broker mock, auth)
- `/scripts` — mobile_tools.sh, memory-bridge.sh (device tooling)
- `render.yaml` — Render blueprint for backend deployment
- `.github/workflows/` — CI (frontend build, backend tests, engine py_compile)

## Data Flow
1. Frontend subscribes via Socket.IO; backend pushes `ticker-update`,
   `fx-signal`, `signal-history`, `positions-update`, `risk-stats-update`,
   `vibe-research-update`, `model-changed`, `trade-executed/rejected`, …
2. Backend relays engine events received over ZMQ PUB and answers REST calls
   (JWT-guarded, rate-limited per IP).
3. Engine `bridge.py` dispatches commands (GET_CANDLES, ANALYZE, EXECUTE,
   GET_POSITIONS, RUN_VIBE_RESEARCH, …) to `orchestrator.py` / broker adapters
   and publishes results on ZMQ PUB topics.
4. Data is cached in `engine/data/cache/` (DiskCache TTL) and persisted in
   sqlite (`fx_analyzer.db`); research reports live in `engine/data/research/`
   and feed the RAG retriever.
