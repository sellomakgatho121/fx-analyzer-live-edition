# Phase 5 — Truth & Hygiene

**Goal:** The repo claims only what it does, docs exist and match code, CI runs, and dead weight is gone.

## Tasks


## Done When

- [ ] README truth-check passes
- [ ] CI file present; local equivalents of its steps all pass
- [ ] No dead code/deps in the main paths

## Notes

- `.github/` currently doesn't exist despite README badge — CI becomes real here.
- Keep the roadmap + phase plan files in root; they document the build journey.
- [x] T1: README truth pass — every feature claim traceable to code (JWT ✓ after Phase 2, rate limiting, kill switch, CI, live demo links) → Verify: no claim without a code reference
  - CI badge → `.github/workflows/ci.yml` written (T3) on this branch + exists upstream; GitHub Pages `/docs` → `Docs/` renamed to `docs/` (matches README links + upstream `pages.yml` source); kill switch → frontend `trading` page toggles `risk_settings.tradingEnabled`, backend risk shield honours it; rate limiting → `server.js` (T4); "direct MT5" overclaims rewritten to broker-adapter honesty (paper default, cTrader gated, MT5 via same contract); Python 3.9+ → 3.11+; `config/` removed from structure (doesn't exist); `CONTRIBUTING.md` + `LICENSE` (MIT) created so claimed links resolve. Verified: every claim greps back to code/files.
- [x] T2: Write missing docs — `docs/PRD.md`, `docs/Project_Structure.md`, `docs/UI_UX_System.md` (referenced by README, currently absent) → Verify: files exist and match the actual code layout
  - All three existed as stale capital-`Docs/` copies (Chart.js/HighCharts, MT5-only, missing auth/engine-depth) — renamed to lowercase `docs/` and rewritten to the actual stack: Next.js App Router routes, Express/Socket.IO/JWT server, engine module map (bridge/data_feed/cache/rag/deep/broker/vibe research), rate limiting, CI.
- [x] T3: CI — `.github/workflows/ci.yml`: frontend build (with `--webpack` fallback note), backend tests, `py_compile` engine → Verify: workflow file valid (lint-checked YAML)
  - 3 jobs: frontend lint (non-blocking) + build; backend `node --check server.js` + `node --test "tests/*.test.cjs"`; engine `compileall` py_compile. YAML `pyyaml.safe_load` ✓; backend suite PASS (rate-limit test: health exempt, 429 after 20 failed logins); engine py_compile OK locally.
- [x] T4: Rate limiting — `express-rate-limit` on `/api/*` → Verify: 429 after N requests; README claim becomes true
  - Installed; `apiLimiter` 300/15min per IP on `/api/*` (health exempt), `authLimiter` 20/15min with `skipSuccessfulRequests` on `/api/auth/login|register`. Verify: `node backend/tests/rate_limit.test.cjs` → health 200, first 429 at attempt #21, message "Too many login attempts".
- [x] T5: Dead code removal — orphan components, unused deps (`yahoo-finance2` never imported), dead bus handlers → Verify: grep clean; build passes
  - `yahoo-finance2` removed from backend deps + lockfile (grep: never imported). Orphan scan across 36 frontend components: none (all imported). Bus cross-check: all client→server events have backend `socket.on` handlers; the one unmatched backend emit (`broker-status`) is a deliberate live broker-notification push, kept.
- [x] T6: Deployment docs — Vercel (frontend), Render (backend), self-hosted engine + MetaApi notes, Windows MT5 path → Verify: doc matches repo reality
  - `docs/DEPLOYMENT.md`: Vercel build/env (`NEXT_PUBLIC_SOCKET_URL`), Render `render.yaml` blueprint + env vars (`JWT_SECRET`, `API_KEY`, `ZMQ_*`, `ENGINE_HTTP_URL`), systemd/Termux engine runs, Windows MT5 adapter path, cTrader creds required for live, CI description. Cross-checked against `render.yaml`, `backend/.env.example`, `bridge.py` port defaults, `socketEventBus.js`.
