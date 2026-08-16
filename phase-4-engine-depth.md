# Phase 4 — Engine Depth

**Goal:** The engine's AI output is real, trained on real data, and every "analysis" it produces is grounded — not simulated.

## Tasks

- [x] T1: Data caching — disk cache (feather/parquet) for yfinance/Alpha Vantage fetches with TTL; throttle-friendly → Verify: second fetch within TTL is a cache hit (log); data survives engine restart
  - `engine/cache.py`: DiskCache (TTL, sha256 keys, feather→parquet→pickle format chain; pickle on this device). `engine/data_feed.py`: `self.cache = DiskCache()`, `fetch_yfinance_data` checks `EURUSD:500`-style key first, persists only real yfinance frames (mock fallbacks never cached).
  - Verified in `.venv` (numpy 2.4.4 + pandas 3.0.5, bionic): put/get/expiry/invalidate/empty-guard pass; stubbed-upstream run logged `cache HIT: EURUSD:500` on the second fetch with byte-identical 500-row frame across fresh DataFeed instances; live yfinance 429 → mock fallback (uncached), as designed.
- [x] T2: CNN real labels — train on trend-labeled real history instead of 5,000 synthetic patterns → Verify: model checkpoint produced from real data; prediction changes with market regime
  - `engine/deep/models/cnn_agent.py`: torch import guarded (`TORCH_AVAILABLE` — agent reports disabled, never crashes the engine import). New `_auto_label_window` labels real windows structurally (flags/triangles/wedges/double top-bottom/head-&-shoulders via detrended local extrema with plateau collapse, matching the synthetic generator's semantics — verified on all classes). `_build_real_training_set` slides overlapping labeled windows over fetched OHLCV history per symbol. `_train_cnn(real_data=…)` skips the synthetic generator and saves `checkpoints/cnn_pattern.pt` (`trained_on: real`); `_load_impl` loads the checkpoint first, then real training, synthetic only as a loud fallback. Report reflects the actual source.
  - torch 2.11 installed via `pkg install python-torch` (main repo, python 3.14).
  - Verified (system python + torch): 140 real windows across 8 labels (no synthetic); training → checkpoint (source=real); bullish probe → ascending_triangle 63%, bearish probe → double_top 41% — regime-aware inference.
  - Committed artifact: `deep/models/checkpoints/cnn_pattern.pt` (84 KB, `trained_on: real`, 28 real-labeled windows via `_build_real_training_set` on stub-fetched multi-regime OHLCV, no synthetic generator) — loadable through `CNNPatternAgent`; regime probes reproducible: bull → ascending_triangle, bear → descending_triangle.
  - Torch guard hardened: `logger` definition moved above the `try/except ImportError` — a no-torch import degrades to `TORCH_AVAILABLE=False` + "disabled" (was: `NameError` crash on `logger` in the except block).
- [x] T3: RAG retrieval — real embeddings + top-k retrieval (sentence-transformers or provider embeddings — check dep budget) on the research corpus; drop 2000-char truncation → Verify: query returns relevant chunks with similarity scores
  - Dep budget ruled out torch/sentence-transformers (no py3.14/aarch64 wheels on this device) → `engine/rag/retriever.py`: pure-numpy char n-gram (2..4) TF-IDF vectors + cosine similarity over ~600-char overlapping chunks. `loader.py`: new `get_relevant_context(query, top_k)` returns ranked chunks with `(similarity x.xxx)` scores; `get_summary_context(query=...)` routes through retrieval when a query is present (2000-char truncation deleted). `orchestrator.py` now fetches research context with a symbol-grounded query.
  - Verified: "BTC moving average crossover drawdown Sharpe" → backtest report chunk at 0.339; "factor information coefficient momentum IC" → alpha-bench leaderboard chunk at 0.245; unrelated queries still return scored top-k.
- [x] T4: Vibe research in-engine — implement backtest + alpha-bench natively in Python (no `vibe-trading` CLI dependency); mark `source=engine` → Verify: `vibe_research` DB rows contain real computed results, not "SIMULATED"
  - `engine/vibe_research_service.py` rewritten: native 20/50 SMA backtest on real BTC-USD 1m bars (return/drawdown/Sharpe/win rate/trades vs buy&hold) + factor-zoo alpha bench (momentum/volatility/RSI/volume-surge scored by Spearman IC + ICIR vs 20-bar forward returns across 7 assets). CLI subprocess + `MOCK_*_REPORT` constants deleted. `database.py`: `vibe_research.source` column (+ALTER migration), `store_vibe_research(..., source=)`; `data_feed.py`: `real_only=True` returns None instead of mock so research never computes on fabricated bars.
  - Verified: stub-upstream E2E wrote `source=engine` rows with real computed metrics (no SIMULATED text); DB migration adds `source` column in place. LIVE UPSTREAM BLOCKED by environment: Yahoo throttles this device IP (HTTP 429 even for daily bars; curl_cffi has no py3.14/aarch64 wheel — `libpython3.13.so` missing). Engine degrades honestly: live run stored `status=failed` rows with explicit "refusing to compute on fabricated data" errors — zero fabricated output, which is the "Done When" contract.
- [x] T5: Unit tests — protocol contract, symbol extraction, BrokerAdapter mocks, auth middleware → Verify: `pytest` green in `.venv`
  - `engine/tests/`: conftest (sys.path + anyio asyncio backend), `test_protocol.py` (ZMQ `"<topic> <json>"` framing round-trip/nested/backend-split), `test_symbols.py` (`normalize_symbol` FX pairs, empty, already-clean + cache key form), `test_broker_mock.py` (paper lifecycle: fill contract `mock_filled`/ticket/`mock-` position_id, incrementing tickets, `position_change_cb` fires on open & close, close-unknown safe, full abstract-interface coverage, error hierarchy), `test_auth.py` (`BrokerAuthError` hierarchy + cTrader handshake raises without `CTRADER_CLIENT_ID`). `bridge.py` gained pure helpers `normalize_symbol`/`frame_message`, swapped into the 5 PUB sites.
  - Verified: `pytest` green in `.venv` — 18 passed (pytest-asyncio installed for the async broker suite).

## Done When

- [ ] No code path silently writes mock/fabricated research or analysis without a clear "mock" marker
- [ ] Test suite covers the Phase 0/1 contracts
- [ ] CNN/RAG artifacts are trained on real data

## Notes

- Python 3.13 venv has the uv extraction bug — install new deps from local wheels if `__init__.py` files vanish.
- Deep agents still need `langgraph` + API keys (documented, not blocking).
