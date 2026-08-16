# Phase 3 — Core Pages Live

**Goal:** The six placeholder pages become real products showing live engine/broker data — no `MOCK_*` constants.

## Tasks

- [ ] T1: `/trading` — order ticket (market/limit/stop, SL/TP), open positions/orders from broker data, risk panel bound to persisted settings, **kill switch** (backend global flag honored by executor) → Verify: place a demo trade from UI; kill switch blocks all execution with notification
- [ ] T2: `/analysis` — live LSTM/CNN/MoE from `analysis:result` via requestAnalysis; prediction chart + per-agent breakdown; remove MOCK_LSTM/MOCK_CNN → Verify: analysis page renders real engine response (technical/fundamental/sentiment/risk values change with symbols)
- [ ] T3: `/agents` — live debate visualization: agent phases + per-agent results from `analysis:result`/langgraph state; remove MOCK_DEBATE_STATE/MOCK_MOE → Verify: agent panels update during an `agent:analyze` run (idle → analysis → consensus)
- [ ] T4: `/signals/[id]` — real signal from DB via new `GET /api/signals/:id`; EXECUTE button → `execute-trade` → `trade-executed` → position visible on /trading → Verify: detail page matches DB row; execute places order on demo broker
- [ ] T5: `/portfolio` — equity/balance curve from real trades + positions (paper or broker) → Verify: curve updates after executed trades
- [ ] T6: `/research` — vibe research viewer using real engine research records (post Phase 4) — wire DB rows now, show "pending" gracefully → Verify: page renders DB-backed rows, no mock
- [ ] T7: `/settings` — account settings, broker connection panel (status + reconnect), risk settings form (persisted) → Verify: settings save → survive restart

## Done When

- [ ] No `MOCK_` constants remain in page components (grep)
- [ ] Every page shows data that traces to backend/engine/broker
- [ ] Full user flow works: signal → analysis → execute → position → portfolio

## Notes

- Depends on Phase 0 (protocol) and Phase 1 (executor) contracts.
- Styling follows the existing Deep Neo system; match neighboring components.
