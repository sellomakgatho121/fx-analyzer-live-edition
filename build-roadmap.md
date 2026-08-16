# Fx-analyzer Build Roadmap

**Goal:** Turn the paper-trading MVP skeleton into a real product: honest data pipeline, agent-executed trading through a broker gateway, real auth, and live pages — with verification at every step.

## Decisions (2026-08-01, user-approved)

| Decision | Choice |
|---|---|
| Direction | Core-first: pipeline → trading → auth → pages → depth → hygiene |
| Broker execution | **cTrader Open API** (free, OAuth 2.0, JSON/WebSocket, demo accounts at any cTrader broker). Agents execute via the engine's broker adapter. Fallback: in-engine Mock/paper adapter (default, zero credentials). MT5 is no longer a target platform |
| Auth | Full JWT (register/login/session, socket auth, server-verified roles) |
| Data off-MT5 | Real yfinance/Alpha Vantage path with caching (no silent mock) |

## Phases (order = dependency chain)

| Phase | File | What | Priority |
|---|---|---|---|
| 0 | `phase-0-pipeline-truth.md` | Fix deep-analysis protocol contract, symbol extraction, single socket, real prices → UI, persistent risk settings, env completeness | Foundation — everything depends on it |
| 1 | `phase-1-broker-execution.md` | BrokerAdapter interface, MetaApi executor, config, risk-guarded agent execution, order tracking | The trading differentiator |
| 2 | `phase-2-auth.md` | JWT auth, /login, socket auth, real premium gating | Product reality |
| 3 | `phase-3-core-pages.md` | Live /trading, /analysis, /agents, /signals/[id] (no more MOCK_*) | Visible value |
| 4 | `phase-4-engine-depth.md` | Data caching, CNN real labels, RAG embeddings, in-engine vibe research, tests | Engine depth |
| 5 | `phase-5-hygiene.md` | README truth, docs/, CI, rate limiting, dead-code removal | Trust & hygiene |

## Execution rules

- New dedicated branch for the build (memory convention) — created on start.
- Verification is LAST in every phase; nothing is "done" without its check passing.
- Mock/paper adapter stays the default so the app runs anywhere; MetaApi activates only when configured.
- Keep changes scoped; no opportunistic refactors.

## Environment reality (documented 2026-08-01)

- This Termux device: engine + backend run on ports 5557/5558 (5555 held by system), Node `zeromq` addon unavailable (degraded mode), frontend builds with `--webpack`.
- Full MT5 live path verified on Windows; MetaApi removes even that dependency.
