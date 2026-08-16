# HANDOFF — Autonomous Trading Robot (continue here)

Last work: 2026-08-08 morning, `~/Fx-analyzer/Fx-analyzer/` (Termux / Android).

## Session 2026-08-08 10:0x SAST — stack restarted + 2 small fixes

Context: this was a session resume. The engine had died (log silent since
08:32, no traceback — externally killed); backend was down too. Restarted both
per the procedure below and verified the weekend state.

### Restarted & verified
- Engine: PID in `/tmp/fx_engine.pid` (relaunched 10:12 SAST), log appends to
  `/data/data/com.termux/files/home/fx-engine.log`. `/health` = degraded
  (broker reconnecting / datafeed unknown) until cTrader reconnects on its own
  cycle — mobile net is flappy, this is normal.
- Backend: via `backend/start.sh` (with Termux node PATH), :4000 healthy.
- Broker DID reconnect: `fx status` → connected=True, account 5871870
  balance=999.77 EUR. `fx positions` → **position 281711149 still open**
  (EURUSD BUY 0.05 @ 1.1563, SL 1.15534 / TP 1.15807). Reconcile lines report
  "1 positions, 1 orders" — the leftover order is still on the account but NOT
  active (`fx orders` = [], i.e. nothing to cancel). First Monday action:
  close 281711149 (`fx close --symbol EURUSD`), then rerun the smoke test.

### Fix 1 — position symbol showed raw id (`"symbol": "1"`)
`connect()` in `engine/broker/ctrader_broker.py` ran `_reconcile()` BEFORE
`_fetch_symbols()`, so positions normalized at startup got the numeric
symbolId instead of the name. Reordered: `_fetch_trader()` → `_fetch_symbols()`
→ `_reconcile()` → `_subscribe_spots()`. Verified: `fx positions` now returns
`"symbol": "EURUSD"`.

### Fix 2 — ticker never had UK100/GER40/JPN225
They were in the frontend formatters (`getDecimals`/`formatSymbolDisplay`) but
missing from `basePrices` in `backend/server.js`, so they never received engine
data and fell off the ticker. Added: UK100 8200, GER40 23300, JPN225 39000.
They show as `source: 'mock'` until the engine ticks them (engine SYMBOLS list
still lacks these — see "Open items" below).

### Verified offline (nothing new was changed in the EFSM path)
- `py_compile` across engine + scripts: OK.
- `pytest engine/tests` — 18 passed.
- Behavioral test of the 2026-08-08 trail/amend fix (`/tmp/verify_modified_fix.py`):
  transient ACCEPTED does not resolve the AMEND waiter; MODIFIED resolves it;
  cache refreshes SL/TP and keeps volume; `_map_execution` returns `amended`.
  ALL PASS.

### Docstring item from the 2026-08-07 HANDOFF
The `http_bridge.py` 5557/5558 docstring issue was already fixed — no
5557/5558 strings remain. Nothing to do.

## Latest session — live-data roadmap completion (2026-08-07 evening)

Completed the "live data" mandate across the stack. All edits are on disk in the
live tree; **the running engine (PID 31341) and backend (PID 2722) still run the
OLD code — restart both to activate** (commands in "Restart to activate" below).

### Backend (`backend/server.js` + new `backend/start.sh`)
- Ticker pass-through: `ticker-update` / `/api/ticker` now use the engine's exact
  price whenever one exists (no random-walk unless the engine never ticked a
  symbol); payload adds `source: 'engine'|'mock'` + `ts` (existing fields
  unchanged). Engine tick `mock` flags propagate to `source: 'mock'`.
- `trade:closed` emitted by `syncClosedTrades()` (was silent).
- Graceful SIGTERM/SIGINT shutdown (HTTP + Socket.IO + sqlite close, 5s force-exit).
- `backend/start.sh`: health-gated launcher (waits for engine :8765/health, then `exec node server.js`).

### Engine (`engine/bridge.py`, `engine/data_feed.py`, `engine/http_bridge.py`, `engine/requirements.txt`)
- All `ticker` events now carry `mock: true|false` (additive): scan ticks
  `{symbol, price, timestamp, mock}`, broker ticks `{symbol, price, bid, ask, timestamp, mock}`.
- `GET /health` now returns `subsystems` (broker/datafeed/llm/calendar/rag) +
  `uptime_seconds`; `status: "degraded"` when broker down or datafeed is mock.
- `MetaTrader5` removed from requirements (zero imports remain).

### Trading scripts
- `scripts/trader_bot.py`: rejects `mock: true` ticks before quote/trailing logic
  (logs `kind=tick decision=skip_mock_tick`). EFSM/`_rebuild_req` fix untouched.
- `scripts/auto_trader.py`: not changed — it subscribes to signals only, so no
  ticker handler exists (deliberately no dead code).

### Frontend (all under `frontend/src`)
- `CandlestickChartEnhanced`: real candles from `/api/backend/candles/:symbol`
  (fetch error or `mock:true` → degraded overlay, never fabricated candles).
- `TickerBar`: live `ticker-update` stream + live/degraded badge from `source`.
- `DashboardMain`: hardcoded stats/risk defaults removed (store-driven now);
  EconomicCalendar (simulated MOCK_EVENTS) no longer rendered.
- `VibeResearchTerminal`: real payloads render without SIMULATED badge/defaults.
- `TradePanel`: accountBalance from store instead of the `10000` mock.
- `tradingStore`: zero/neutral defaults; added `lastTickerSource`/`accountBalance`.
- `useSocket`: `ticker-update` → `tradingStore.setCurrentPrice` (active pair).
- Dashboard Agent Arena tab wired to agentStore/tradingStore (live like `/agents`).
- Build verified: `npx next build --webpack` PASSES (16/16 pages, zero errors).

### Docs
- `README.md`: added "Engine & Backend Runtime" + "Trading Scripts & CLI".
- `backend/.env.example`: ZMQ ports corrected to live 5565/5566.
- `docs/DEPLOYMENT.md`: Termux port claims reconciled.

### Activation status (2026-08-08 07:0x SAST)
- Engine + backend both RESTARTED and running the new code.
- Engine: PID 18539 (pidfile `/tmp/fx_engine.pid`), relaunched 07:38 SAST per
  the procedure below with the trail/amend fixes (see "Trail/amend — root
  cause + fix" below); `/health` returns the subsystems report
  (`broker: reconnecting`, `datafeed: unknown`, `llm: configured`,
  `calendar: mock`, `rag: ok`). The broker was in a 300s reconnect backoff at
  restart — it reconnects on its own cycle (mobile net is flappy).
- Backend: PID 22964 via `backend/start.sh`. IMPORTANT: on this device start.sh
  MUST run with the Termux node in PATH —
  `PATH=/data/data/com.termux/files/usr/bin:$PATH ./start.sh`
  (the PRoot `/usr/bin/node` v22 can't load the Termux-built sqlite3 addon:
  ERR_DLOPEN_FAILED / liblog.so). Note added in start.sh header.
- Engine log: all relaunches now append to
  `/data/data/com.termux/files/home/fx-engine.log` (the explicit path in the
  restart snippet). An older engine log from Friday lives in
  `/home/blacklight/fx-engine.log` (relaunched from a `$HOME=/home/blacklight`
  shell before the path was fixed) — ignore it.
- Restart procedure (if needed again):
```bash
cd ~/Fx-analyzer/Fx-analyzer
kill <engine_pid>    # check `ps` first
set -a; . /tmp/fx_engine_env.txt; set +a
nohup .venv/bin/python engine/bridge.py >> /data/data/com.termux/files/home/fx-engine.log 2>&1 &
echo $! > /tmp/fx_engine.pid
kill <backend_pid>
cd backend && PATH=/data/data/com.termux/files/usr/bin:$PATH ./start.sh
```

### Frontend build note (Termux/proot quirk)
`next build --webpack` needs linux-arm64-gnu native binaries; installed with
`npm install --no-save lightningcss-linux-arm64-gnu@1.32.0 @tailwindcss/oxide-linux-arm64-gnu@4.3.3`
(from `frontend/`). A plain `npm install` drops them — re-run that if the build fails again.

### Trail/amend — root cause + fix (2026-08-08)
Friday's four `amend_failed` logs were FOUR distinct bugs:
1. `INVALID_REQUEST ... more digits than allowed` (13:17) — amend sent an
   unrounded SL. Fixed Friday by `_round_price()` in `amend_position_sltp()`.
2. `TRADING_BAD_STOPS ... New SL ... should be <= current BID` (15:00) — the
   bot trailed on a scan-loop tick whose "price" was masquerading as bid/ask
   and diverged from the live market. **Fixed now**: `on_ticker` only accepts
   real feed ticks (bid AND ask > 0); price-only scan ticks are skipped
   (`skip_scan_tick`), mock ticks still `skip_mock_tick`.
3. `Operation cannot be accomplished in current state` (16:00) — ZMQ EFSM
   corruption. Fixed Friday: RCVTIMEO 90000 + `_rebuild_req()`.
4. `cTrader no execution event within 30.0s` (16:45) — **the real amend bug,
   fixed now**. `EXEC_ORDER_MODIFIED (=4)` was never defined, and the
   execution-event terminal sets (`_on_message`, `_on_execution`,
   `_await_execution`) all excluded MODIFIED — so an AMEND's MODIFIED event
   never resolved the request waiter, every amend timed out at 30s, and the
   reconcile-and-verify fallback failed because `_on_execution` DROPPED the
   position from the cache on any position event (re-adding only on FILLED),
   so `_sltp_matches` had nothing to match. Fixes in
   `engine/broker/ctrader_broker.py`:
   - added `EXEC_ORDER_MODIFIED = 4`;
   - MODIFIED is terminal in all three waiter sets (AMEND resolves);
   - `_on_execution` cache: MODIFIED refreshes the cached position (SL/TP),
     FILLED keeps it only if remaining volume > 0, other events leave the
     cache alone;
   - `close_position()` drops the position from the cache on success.
   Verified offline: `py_compile` + behavioral test (MODIFIED resolves the
   waiter, cache refreshes SL, `_map_execution` returns `amended`) PASS.

### Position state (corrected 2026-08-08 07:35 SAST)
- **Position 281711149 IS STILL OPEN** (EURUSD BUY 0.05 @ 1.1563, SL 1.15534 /
  TP 1.15808). cTrader reconcile consistently reports "1 positions, 1 orders"
  through Friday night and this morning, and a `fx close` attempt at 07:14 got
  `MARKET_CLOSED` (the server still held the position). Friday's 16:45
  "CLOSED ticket=313474855" was wrong — the close order was created but never
  actually filled.
- There is also **1 leftover order** on the account (probably that un-filled
  close order). Check `fx positions` + `fx orders` on Monday.
- Trap: `BROKER_POSITIONS` / `fx positions` during a broker DISCONNECT returns
  the engine's cache (which can be empty/stale) — `get_positions()` reconciles,
  and on failure serves the cache. Ground truth only while connected; the
  engine log's "cTrader reconciled: N positions" lines are the server's answer.

### Pending verification — EFSM end-to-end (weekend-blocked)
- Smoke test (07:15 SAST) could not exercise entry→trail→close: market closed
  → quote fell back to mock candles (1.079 vs live 1.1563) → TP wrong-side →
  broker safely rejected → `FAIL: entry did not open a position`. Not an EFSM
  failure. ZMQ probe confirmed the `mock: true` flags end-to-end.
- **When the market reopens (Monday SAST):**
  1. Wait for the broker to connect (`fx status`), then close the leftover:
     `fx close --symbol EURUSD` (position 281711149).
  2. Check `fx orders`; if the stale close order is still active, cancel or
     ignore it (verify the position closed cleanly).
  3. Rerun the smoke test:
     `FX_BOT_TRAIL_ACTIVATE=0.05 FX_BOT_TRAIL_GAP=0.2 .venv/bin/python scripts/test_trader_flow.py`
     (background, ~15 min). Expect ENTRY FILLED → TRAIL
     `sl ... -> ... (raised)` → CLOSE ok → PASS.
  4. If amend STILL logs `no execution event within 30.0s`, the MODIFIED event
     is not arriving on this feed at all — next step is raising `_EXEC_TIMEOUT`
     or relying on the reconcile-verify fallback (which returns
     `amended (verified via reconcile)` when it applies).

## Goal (user's original ask)
Autonomous trading robot like premium bots: use the app's backend (MoE LLM
signals, agents) to pick trades, execute them, trail them, and close at best
profit. This is demo money (cTrader demo, EUR 1,000, account 48126065) —
real orders are fine to fire.

## Architecture
- `engine/bridge.py` — asyncio engine; ZMQ PUB `tcp://127.0.0.1:5565` (env
  `ZMQ_PORT`), ZMQ REP CMD `tcp://127.0.0.1:5566` (`ZMQ_CMD_PORT`), HTTP
  `http://127.0.0.1:8765` (`/health`, `/cmd`, `/events` SSE). MoE consensus
  publishes `signal` events on the PUB socket. Scan loop publishes `ticker`
  events. Engine logs to `~/fx-engine.log` (timestamps **SAST +2h**).
- `engine/broker/ctrader_broker.py` — cTrader Open API (demo). Execution
  quirks: PRICE_FACTOR=100000 scaling, positions reported raw → `_norm_price`
  (÷100000 when ≥1000), SL/TP for AMEND sent **unscaled** (server validates
  against literal bid/ask), `_round_price` (digits by magnitude), execution
  events: transient ACCEPTED(2) must be skipped; terminal = FILLED(3),
  PARTIAL_FILL(11), REJECTED(7), CANCELLED(5), EXPIRED(6), MODIFIED(4).
- `scripts/trader_bot.py` — **the autonomous robot** (main deliverable).
  Env config (see file header): FX_BOT_MIN_CONFIDENCE=0.45 default,
  MAX_POSITIONS=3, RISK_PCT=0.5% (ATR-based sizing, vol 0.01–0.10),
  RR=2.0, TRAIL_ACTIVATE=0.5, TRAIL_GAP=0.8, MAX_HOLD_MIN=240,
  DAILY_LOSS_PCT=2.0, FX_BOT_SYMBOLS allowlist (empty = all),
  FX_BOT_DRYRUN. Subscribes signal/ticker/notification; REQ commands with
  retry; logs JSON lines to `data/trader_log.jsonl`.
- `scripts/auto_trader.py` — simpler signal-follower (guardrails only).
- `scripts/fx.py` — CLI to drive the engine (status, models, candles,
  analyze, trade, close, positions, signals, brief, watch).
- `scripts/test_trader_flow.py` — smoke test driving the bot's real
  entry→trail→close against the live demo broker with a synthetic signal.
- `scripts/run_trader.sh` — launcher for the bot.

## Current state (verified working)
- Engine healthy: HTTP :8765 OK; broker reconnects automatically
  (mobile network is FLAPPY — drops every few minutes, 5s→30s backoff).
- CLI works: `fx status`, `fx trade EURUSD buy 0.05`, `fx close`,
  `fx positions`, `fx signals`, `fx analyze "..." --agents`.
- Full stack smoke test PASSES for **entry + close** (FILLED EURUSD BUY
  0.06 lots, then CLOSED). Entry now retries 3× on "not connected".
- Bot-side ticker handling hardened: scan tickers `{symbol,price,ts}`;
  feed tickers `{symbol,bid,ask,price,ts}` with bid=0.0 when missing —
  explicit `is not None` fallbacks, mid falls back to the present side,
  stale-tick clamp (skip amend if SL would sit on the wrong side of bid/ask).

## Just-fixed bug (unverified — NEXT STEP)
ZMQ EFSM corruption: the bot's REQ socket had `RCVTIMEO=25000` while the
engine legitimately holds the REP 30s+ awaiting broker execution events.
`_req` caught `zmq.Again` and blindly re-sent → ZMQError "Operation cannot
be accomplished in current state" → amend/close silently failed
(`data/trader_log.jsonl` entries 11-12). Fixed in trader_bot.py AND
auto_trader.py: RCVTIMEO=90000 + `_rebuild_req()` recreates the REQ socket
on genuine timeout.

**Do next:** rerun the smoke test to verify trail→amend→close all succeed:
```bash
cd ~/Fx-analyzer/Fx-analyzer
# engine must be up; if broker disconnected, test waits up to 6 min itself
FX_BOT_TRAIL_ACTIVATE=0.05 FX_BOT_TRAIL_GAP=0.2 \
  .venv/bin/python scripts/test_trader_flow.py
```
Expect: ENTRY FILLED → TRAIL `sl ... -> ... (raised)` → CLOSE ok → PASS.
The small activate/gap values are required: the broker validates the
amended SL against its LIVE bid, so the synthetic favorable tick must stay
near the real market. Then run the real bot:
`scripts/run_trader.sh` (add `--dry-run` first to observe).

## Traps & quirks (read before touching anything)
1. **Clock skew**: bot logs UTC (`utcnow()`), engine log = SAST (+2h).
   When correlating events add 2h to engine timestamps.
2. **Mock data divergence**: GET_CANDLES / scan-loop tickers can return
   yfinance/mock prices (e.g. EURUSD 1.07176 when cTrader live is 1.1555)
   — response has `mock: true`. NEVER use them for SL/TP; broker rejects
   "wrong side" (safe, but entries get skipped). Only live broker ticks
   (bid & ask both > 0) are authoritative.
3. **Signals are sparse** (10–20 min) and low confidence (0.30–0.55) on
   demo; bot's default MIN_CONFIDENCE 0.45 means long idle periods. That's
   expected, not a bug.
4. Engine env vars (OpenAI keys, ZMQ ports) live in `/tmp/fx_engine_env.txt`
   (sourced before `nohup .venv/bin/python engine/bridge.py`). Engine pid:
   `/tmp/fx_engine.pid`. Log: `~/fx-engine.log`.
5. `_round_price`: `digits = max(1, min(5, 5 - floor(log10(abs(px)))))`.
6. Don't `pkill -f engine/bridge` patterns that match your own shell;
   use the pidfile.
7. cTrader account: demo 48126065, ~EUR 1,000; balance drifting by
   commissions/spreads from smoke tests (~EUR 997–999).

## Open items (if you have time)
- Verify trail→amend→close end-to-end (blocked until market reopens Monday) —
  see "Pending verification" above: close leftover position 281711149, check
  the leftover order, rerun the smoke test. The MODIFIED-waiter + scan-tick
  fixes are in; if amend still times out, raise `_EXEC_TIMEOUT` or rely on the
  reconcile-verify fallback.
- Backend `basePrices`: UK100/GER40/JPN225 were added (2026-08-08) — they now
  appear in the ticker as `source: 'mock'`. To give them real data, add them
  to the engine `SYMBOLS` list (`engine/bridge.py`) + `YF_MAPPING`
  (`engine/data_feed.py`: UK100→`^FTSE`, GER40→`^GDAXI`, JPN225→`^N225`) so
  the scan loop actually ticks them. Do this only if those instruments matter.
- Note: the cTrader account shown by `fx status` is 5871870 (Spotware demo,
  balance 999.77 EUR) — the old doc line about 48126065 is stale; the account
  id is discovered from the token and only overridden by CTRADER_ACCOUNT_ID.

## Test harness note
`scripts/test_trader_flow.py` now: waits up to 6 min for broker connect →
GET_CANDLES/broker-tick quote (prefers live bid/ask, mock-checked candles
fallback) → synthetic BUY signal through the bot's real on_signal → trail
via a fresh near-market tick → close_and_log. `--dry-run` sets
`tb.DRYRUN` (module attr, works now).
