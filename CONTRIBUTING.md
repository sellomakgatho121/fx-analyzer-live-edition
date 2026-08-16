# Contributing to FX Analyzer Pro

Thanks for contributing! This project follows a phased, evidence-driven build
process — every feature should land with its verification note.

## Getting started

1. Fork the repo and create a branch off `main` (or the current phase branch).
2. Install per the README Quick Start.
3. Make your change, then run the relevant checks:

```sh
# Engine unit tests (pytest)
cd engine && .venv/bin/python -m pytest tests/ -q

# Backend tests + syntax
cd backend && node --test "tests/*.test.cjs" && node --check server.js

# Frontend build
cd frontend && npm run build -- --webpack
```

## Before opening a PR

- Add or update tests for the change — the verification step for every task on
  the roadmap is a run command with evidence.
- Run the checks above and paste their output into the PR description.
- No secrets: never commit `.env`, API keys, or real credentials. Use
  `backend/.env.example` as the template for new env vars.
- Keep docs truthful: if you change a feature, update the matching claim in
  `README.md` and `docs/PRD.md` — the README truth pass is a standing rule.
- Run `git diff --stat` to make sure you are not committing runtime artifacts
  (`engine/data/cache/*`, `fx_analyzer.db`, checkpoint binaries are intentional
  only when documented).

## Phases

The project is built phase-by-phase (see `phase-*.md` at the repo root). Match
your change to the relevant phase doc's task list where one exists, and update
the task's checkbox + evidence block when it is completed.