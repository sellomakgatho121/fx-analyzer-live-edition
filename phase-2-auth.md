# Phase 2 — Real Authentication (JWT)

**Goal:** Real accounts, real sessions, server-verified roles — replace the fake `role:'admin'` claims and static API key.

## Tasks

- [x] T1: Backend auth — `POST /api/auth/register`, `POST /api/auth/login` (argon2/bcrypt hashing), JWT sign/verify middleware; protect `/api/admin/*` and trade endpoints → Verify: `curl` register → login → authorized admin call returns 200; missing/invalid token returns 401 ✅ (2026-08-03: curl-verified against live server)
- [x] T2: Users table migration — align seeded users (`devtest@fx.com`, `user@fx.com`) with real hash format so they can log in → Verify: seeded users log in successfully ✅ (both seeds log in; legacy plaintext auto-upgraded on login)
- [x] T3: Socket auth — verify JWT in handshake; join `premium` room only when `subscription_status='active'` (fix fake gating at server.js:237/338) → Verify: socket without token rejected; premium-only events unreachable for non-subscriber ✅ (handshake auth `io.use(makeSocketAuth)`; premium join per-DB-value at server.js:598-602; bad token → AUTH_ERROR, good token connects)
- [x] T4: Frontend `/login` + `/register` pages in Deep Neo design; route guard in `(main)/layout.js`; sessionStore persists JWT → Verify: login flow lands on /dashboard; page refresh keeps session ✅ (AuthShell + login/register pages; guard + admin guard; JWT in localStorage `fx_session`)
- [x] T5: Remove fake auth in DashboardMain.jsx (token:'default-user', role:'admin') — use sessionStore token → Verify: admin page works with a real logged-in user; no fake claims anywhere (grep) ✅ (no fake claims remain; admin page fetches with Bearer token)
- [x] T6: Server-verified subscription claims (role/subscription from DB, never client-supplied) → Verify: downgraded user loses premium room access immediately ✅ (`/api/auth/me` + socket room gating read from DB at handshake)

## Done When

- [x] Register/login/logout/session-refresh works end-to-end ✅
- [x] No route or socket is protected by client claims ✅ (server enforces JWT on REST + socket handshake; client guards are UX-only redirects)
- [x] README's JWT claim becomes true ✅

## Notes

- Keep API-key middleware for server-to-server (engine ↔ backend) or remove if unused — decide in T1.
- Session store already exists (useSessionStore) — wire, don't rebuild.
