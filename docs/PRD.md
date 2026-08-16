# PRD: FX Analyzer Pro

## Goal Description
A high-performance Forex analysis application that combines real-time market data,
multi-indicator technical analysis, LLM-powered reasoning, and paper-trading
execution. The app bridges the gap between complex analysis and precise,
risk-governed order placement, running fully server-side with a web dashboard.

## System Requirements
- **Real-time Data Processing:** Low-latency streaming of FX pair data via a
  Python engine publishing over ZMQ (PUB/SUB framing: `"<topic> <json>"`).
- **Signal Accuracy:** Multi-indicator technical analysis combined with LLM-powered
  sentiment and pattern reasoning (Gemini Flash, free tier), plus a CNN pattern
  agent trained on real labeled windows (structural labeler) and an LSTM agent.
- **Free Institutional Grade Analysis:** Google Gemini Flash for high-context market
  reasoning; free yfinance market data with TTL disk caching.
- **Paper-Trading First:** Full simulation broker (`MockBrokerAdapter`) for
  position lifecycle, risk-shielded order placement, and kill-switch controls;
  live broker adapters (cTrader) gated behind credentials.
- **User Interface:** Premium futuristic dashboard — real-time charts
  (lightweight-charts), 3D FX arena, agent arena, live risk panel.

## Tech Stack (as built)
- **Frontend:** Next.js (App Router), Vanilla CSS design tokens, three/drei/fiber
  (3D), lightweight-charts, zustand, framer-motion, lucide icons, Socket.IO client.
- **Backend:** Node.js + Express + Socket.IO (port 4000). JWT auth (bcrypt +
  jsonwebtoken), express-rate-limit on `/api/*` (brute-force shield on
  `/api/auth/login|register`), ZMQ client to the engine, sqlite persistence.
- **LLM Provider:** Google Gemini Flash API (free tier).
- **Communication:** Socket.IO for real-time UI updates; ZMQ (PUB/REQ) between
  backend and engine; HTTP bridge fallback.
- **Broker Integration:** Adapter pattern — `MockBrokerAdapter` (paper),
  `CtraderBrokerAdapter` (cTrader REST/JWT handshake). MT5 is reachable through
  the same adapter surface on Windows via the engine's broker layer.

## Engine (Python) Modules
- `bridge.py` — ZMQ bridge: command dispatch (GET_CANDLES, ANALYZE, EXECUTE…),
  topic framing, symbol normalization.
- `data_feed.py` + `cache.py` — yfinance ingestion with DiskCache (TTL, sha256
  keys, feather→parquet→pickle chain); `real_only` paths refuse fabricated data.
- `orchestrator.py` — signal pipeline orchestration; `agents/` (technical,
  sentiment, fundamental, risk); RAG-grounded LLM context.
- `deep/` — CNN pattern agent (real labels, checkpointed, torch-guarded) and
  LSTM agent; `deep/sentiment/` news analyzer.
- `rag/` — TF-IDF char-ngram retrieval over the research corpus with
  similarity-scored context (no embeddings dependency).
- `vibe_research_service.py` — native backtesting (20/50 SMA crossover) and
  factor-zoo alpha benchmarking (Spearman IC/ICIR) writing `source='engine'`
  rows; honest `failed` rows when upstream data is unavailable.
- `broker/` — `base.py` (contract + error hierarchy), `mock_broker.py` (paper),
  `ctrader_broker.py` (live, env-gated).
- `trading_agents/` — multi-agent workflow orchestration (research → analyst →
  manager → risk), state machine, MCP-style tool surface.
- `tests/` — pytest suite: protocol framing, symbol normalization, paper-broker
  lifecycle, auth error hierarchy (18 tests, green in `.venv`).

## Roadmap Status
1. **Foundation:** Next.js + Python engine + ZMQ bridge — ✅
2. **Analysis:** Technical/sentiment/fundamental agents + LLM reasoning — ✅
3. **Connectivity:** Socket.IO ↔ ZMQ pipelines, broker adapters, paper trading — ✅
4. **UI:** Neon dashboard, 3D arena, live panels — ✅
5. **Execution:** End-to-end signal → risk-shield → paper-order flow — ✅
6. **Depth:** TTL data caching, real-labeled CNN, RAG retrieval, in-engine vibe
   research, unit tests — ✅
7. **Hygiene:** README truth pass, docs, CI, rate limiting, dead-code removal,
   deployment guide — ✅
