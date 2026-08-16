# Phase 0 — Make the Pipeline Honest

**Goal:** The frontend, backend, and engine speak one protocol and show real data, so everything built later is truthful.

## Tasks

- [x] T1: Define canonical `analysis:result` payload contract — engine/agent_bridge.py now emits `deep_analysis.lstm/.cnn/.sentiment` matching `normaliseDeepAnalysis` in frontend/src/lib/socketEventBus.js; MoE `technical/fundamental/sentiment/risk/aggregate` consensus attached to every `ENGINE_AGENT_ANALYZE` reply (`_attach_moe_consensus`); `language_graph_state` + `_derive_phase` included. Verified via REP test: moeConsensus carries real technical data; deep keys present (neutral values — deep agents deferred, see Notes).
- [x] T2: Fix `_extract_symbol` in engine/agent_bridge.py — handles `EURUSD`, `EUR/USD`, `GBP/USD`, slashed symbols, indices, whitelist. Verified: 10/10 unit tests pass.
- [x] T3: Single socket connection — DashboardMain.jsx dropped raw `io('http://localhost:4000')`, uses `socketEventBus.connect()` (honors `NEXT_PUBLIC_SOCKET_URL`), bus event names (`signal:new`, `trade:executed`, `notification`, `ticker-update`), unsubscribe-cleanup without killing the shared socket. Verified: production build passes; one bus-owned socket in the browser.
- [x] T4: Dead socket surface — useSocket.js pruned to handlers the backend actually emits (connect/disconnect/connect_error, signal:new, signal-history, trade:executed, trade-rejected, risk:update, risk-stats-update, model-changed, notification). Verified: grep finds zero registrations for `signal:update/trade:closed/agent:*/lstm:*/cnn:*/research:*/rag:*/market:price/system:*`.
- [x] T5: Real prices → UI — backend `GET /api/candles/:symbol` (engine GET_CANDLES, yfinance-backed, `source: live|mock`); CandlestickChart fetches real candles (badge shows LIVE/MOCK), live ticks extend the last candle; TickerBar receives real `ticker-update` data. Verified end-to-end: EUR/USD ticker price 1.09360 (real engine tick, not the 1.0865 static base), GBPUSD live candles, 6 ticker broadcasts in 12s.
  - ⚠️ Engine data feed (Phase 4): `US30` candles return ~150 not ~42850 — yfinance symbol mapping needs fixing in the engine feed; ticker fallback base still shows the right level.
- [x] T6: Persist risk settings — `risk_settings` table created; backend loads on connect and upserts on `update-risk-settings` (id=1). Verified: socket update persisted to DB row and reloads after restart.
- [x] T7: Complete `.env.example` — frontend/.env.example (NEXT_PUBLIC_SOCKET_URL, NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_API_KEY, webhook server-side vars) and backend/.env.example (PORT, API_KEY, ZMQ_PORT, ZMQ_CMD_PORT, ENGINE_HTTP_URL). Broker keys land with Phase 1.

## Done When

- [x] Frontend shows backend/engine data end-to-end (prices, candles, risk, commands) with zero MOCK constants in the data path
- [x] One socket connection, no dead event handlers
- [x] Phase 1–5 can build on stable contracts

## Notes

- **Transport fallback (device-specific):** the `zeromq` Node addon cannot load on Termux/Android → new `engine/http_bridge.py` (stdlib + pyzmq only) exposes the engine over `POST /cmd` (port 8765) + `GET /events` SSE (topics: ticker/signal/vibe-research/notification). backend/server.js auto-falls back: `sendCommandHttp` + `startHttpEvents` SSE consumer + per-command timeouts (`CMD_TIMEOUTS`, default 15s, 240s for ENGINE_AGENT_ANALYZE). ZMQ path untouched and still primary where the addon builds.
- **Deep agents deferred to Phase 4:** torch (aarch64 PyPI wheel needs CUDA/nvidia deps, CPU index unreachable, disk 100% full at 1.3G) → LSTM/CNN agents load-fail. Canonical neutral keys keep the frontend honest (verified). Revisit when disk clears; sentiment agent only needs aiohttp+textblob (both installed).
- Commands verified over HTTP fallback: GET_CANDLES (live), EXECUTE_TRADE (filled), GET_MODELS, agent:analyze (moeConsensus attached; deep keys neutral).
- `fx_analyzer.db` risk_settings row: `{maxDailyDrawdown:500, maxOpenPositions:5, maxRiskPerTrade:3, tradingEnabled:true}` (from the round-trip test).
- Don't touch UI styling here — data wiring only.
