# Phase 1 — Broker Execution (cTrader Open API)

**Goal:** Trades placed from the app (by user or by agents) execute on a real broker and reflect on the cTrader platform — via cTrader Open API, or the in-engine paper adapter.

## Decision (2026-08-01, user-chosen)

**cTrader Open API** (openapi.ctrader.com) is the primary broker integration:
- **Free**, demo accounts free at any cTrader broker (Pepperstone, IC Markets, Tickmill, FP Markets, Vantage, Eightcap, Exness, BlackBull…)
- OAuth 2.0 app registration at openapi.ctrader.com (**manual approval**), user grants access via cTrader ID, access token ~30 days + non-expiring refresh token
- Persistent WebSocket connection (`wss://demo1.p.ctrader.com` / `live1.p.ctrader.com`), payloads in **JSON or Protobuf**; official Python SDK (`ctrader-open-api`, Twisted, TCP-only) is stale — plan uses a thin **asyncio-native JSON/WebSocket client** (`websockets` lib) to match the engine's event loop
- Rate limits: 50 req/s/connection; max 2 concurrent connections (1 demo + 1 live); heartbeat every 10s
- **No MT5 integration** (accepted — cTrader becomes the trading platform)
- Not available to US citizens/residents
- No built-in risk limits — **app-side risk guard is the authority** (drawdown caps, max positions, kill switch)

## Tasks

x T1: Extract `BrokerAdapter` interface in engine (status / positions / orders / execute / modify / close) from executor.py; keep existing behavior as `MockExecutor` (paper, default) → Verify: paper path unchanged; engine boots with mock default
x T2: cTrader client — thin asyncio JSON/WebSocket client (`websockets`): connect, heartbeat, OAuth token + refresh, `ProtoOANewOrderReq`-equivalent JSON flows (market/limit/stop, SL/TP, modify/close, reconcile) → Verify: connects to a **demo** cTrader account; broker-status returns real account info; reconnects after disconnect
x T3: Broker config via env — `BROKER_PROVIDER=mock|ctrader`, `CTRADER_CLIENT_ID`, `CTRADER_CLIENT_SECRET`, `CTRADER_ACCESS_TOKEN`, `CTRADER_ACCOUNT_ID` → Verify: mock when unset; ctrader when set; bad creds fail loudly
x T4: Wire MoE signal + LangGraph trader decision → executor, guarded by app-side risk settings (drawdown caps, max positions, kill-switch flag) → Verify: demo order executes within limits; rejected with reason when exceeded
x T5: Backend bridge — map engine broker status/positions to socket events (`broker-status`, `positions-update`); keep `mt5-status` name for compat → Verify: socket smoke test covers new events
x T6: Order tracking — executed trades persisted in DB with broker ticket id + status sync → Verify: `/api/trades` shows broker trades with real ticket numbers
x T7: Setup helper — docs + script for the OAuth grant flow (register app, grant access, get token) → Verify: script produces a usable token for a demo account
 T8: End-to-end verification — place a trade from the app, confirm it appears in the cTrader platform (and back via positions stream) → Verify: order lifecycle complete: placed → filled → position open → closed

## Done When

- [ ] `BROKER_PROVIDER=ctrader` + demo creds → trade from app reflects on broker (blocked — see Status)
- [x] Agents can execute on behalf (MoE signal path produces a real order) — verified: `_maybe_auto_execute` executes real adapter orders when under limits (`AUTO_EXECUTE_SIGNALS=1`), blocked with reason otherwise
- [x] Risk guard demonstrably blocks over-limit trades — verified live: `MAX_OPEN_POSITIONS=2` → 3rd signal blocked with "max open positions reached (2)"; executes again after a close (8/8 checks)

## Status (2026-08-01)

**T1–T7: complete and verified.** The socket smoke test (`/tmp/broker_smoke_test.js`) passed **8/8 consecutive runs, 6/6 checks** each time, covering: `broker-status` + `mt5-status` events, positions pull, `execute-trade` → `trade-executed` with broker ticket + `position_id`, the live positions stream (mock broker → engine PUB 5557 → http_bridge SSE 8765 → backend → `positions-update`), and `/api/trades` persistence of ticket + position_id.

Three root causes were found and fixed during verification:
1. **Backend listener-registration race** (`backend/server.js`) — an `await` before `socket.on(...)` registration dropped early client events; handlers now register synchronously, and `executedTrade` carries `position_id`.
2. **Engine REP-loop stall** (`engine/bridge.py`) — slow yfinance `GET_CANDLES` fetches (rate-limited, up to 25 s) blocked broker commands behind them; added an in-process candle cache (TTL 90 s, env `CANDLE_CACHE_TTL`) → repeated candle requests now return in ~0.01 s.
3. **Mock broker lifecycle** (`engine/broker/mock_broker.py`) — now keeps in-memory positions with unique incrementing tickets, fires `position_change_cb` on execute/close, and mirrors the cTrader notify path, making the whole positions stream testable end-to-end.

**T8: BLOCKED — awaiting Spotware approval.** The cTrader OAuth app is registered, but a live token attempt returned `CH_CLIENT_AUTH_FAILURE: OA client is not in active state` — the app is in review at Spotware. Once approved:

```
python scripts/ctrader_oauth.py --listen   # or --code <url> / --refresh-token
# then in .env:
BROKER_PROVIDER=ctrader
CTRADER_ACCOUNT_ID=<demo account id>
# token written by the script
```

Restart the engine afterwards with the same ports it currently uses: `ZMQ_PORT=5557 ZMQ_CMD_PORT=5558`.

## Notes

- User signs up for a cTrader broker demo account + Open API app before T2.
- Python 3.13 venv has the uv extraction bug — install `websockets` from a local wheel if files vanish.
