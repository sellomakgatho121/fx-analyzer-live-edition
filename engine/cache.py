"""Phase 4 (T1) — disk cache for market-data fetches.

Feather/parquet on-disk cache with a TTL so throttle-friendly engines only
hit the upstream (yfinance / Alpha Vantage) once per TTL window. Data
survives engine restarts (it lives on disk).

Usage::

    from cache import DiskCache
    cache = DiskCache(ttl_seconds=300)
    df = cache.get("EURUSD:500")
    if df is None:
        df = fetch_from_upstream()
        cache.put("EURUSD:500", df)
"""

import hashlib
import logging
import os
import time
from datetime import datetime

import pandas as pd

log = logging.getLogger(__name__)

# Default cache location: <project>/engine/data/cache
DEFAULT_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "cache")


# ── storage backend ───────────────────────────────────────────────────
# Prefer feather (pyarrow) → parquet (fastparquet) → pickle fallback.
# This device (python 3.14 / aarch64) ships no arrow wheels, so pickle
# keeps the cache working there; feather/parquet engage where available.
try:
    import pyarrow  # noqa: F401  (feather)
    FORMAT, EXT = "feather", "feather"
except ImportError:
    try:
        import fastparquet  # noqa: F401  (parquet)
        FORMAT, EXT = "parquet", "parquet"
    except ImportError:
        FORMAT, EXT = "pickle", "pkl"


def _frame_to_file(df: pd.DataFrame, path: str) -> None:
    if FORMAT == "feather":
        df.reset_index(drop=True).to_feather(path)
    elif FORMAT == "parquet":
        df.reset_index(drop=True).to_parquet(path, engine="fastparquet")
    else:
        with open(path, "wb") as fh:
            import pickle
            pickle.dump(df, fh, protocol=4)


def _frame_from_file(path: str) -> pd.DataFrame:
    if FORMAT == "feather":
        return pd.read_feather(path)
    if FORMAT == "parquet":
        return pd.read_parquet(path, engine="fastparquet")
    with open(path, "rb") as fh:
        import pickle
        return pickle.load(fh)


class DiskCache:
    """TTL-bounded on-disk cache (feather/parquet/pickle) keyed by string."""

    def __init__(self, cache_dir: str | None = None, ttl_seconds: float = 300.0):
        self.cache_dir = cache_dir or DEFAULT_CACHE_DIR
        self.ttl_seconds = ttl_seconds
        self.format = FORMAT
        os.makedirs(self.cache_dir, exist_ok=True)

    # ── key helpers ────────────────────────────────────────────────────
    @staticmethod
    def hash_key(key: str) -> str:
        return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]

    def _path(self, key: str) -> str:
        return os.path.join(self.cache_dir, f"{self.hash_key(key)}.{EXT}")

    def _meta_path(self, key: str) -> str:
        return f"{self._path(key)}.meta"

    # ── public API ────────────────────────────────────────────────────
    def get(self, key: str) -> pd.DataFrame | None:
        """Return a fresh cached frame, or None on miss / staleness."""
        path, meta = self._path(key), self._meta_path(key)
        if not (os.path.exists(path) and os.path.exists(meta)):
            return None
        try:
            with open(meta, "r") as fh:
                cached_at = float(fh.read().strip())
        except (OSError, ValueError):
            return None
        if time.time() - cached_at > self.ttl_seconds:
            log.info("cache miss (expired): %s (age %.0fs > ttl %.0fs)",
                     key, time.time() - cached_at, self.ttl_seconds)
            return None
        try:
            df = _frame_from_file(path)
        except Exception as e:  # corrupted frame → treat as miss
            log.warning("cache read failed for %s: %s", key, e)
            return None
        log.info("cache HIT: %s (%d rows, fetched %s)", key, len(df),
                 datetime.fromtimestamp(cached_at).isoformat(timespec="seconds"))
        return df

    def put(self, key: str, df: pd.DataFrame) -> None:
        """Persist a frame + freshness marker."""
        if df is None or df.empty:
            return
        try:
            _frame_to_file(df, self._path(key))
            with open(self._meta_path(key), "w") as fh:
                fh.write(str(time.time()))
        except Exception as e:
            log.warning("cache write failed for %s: %s", key, e)

    def invalidate(self, key: str) -> None:
        for p in (self._path(key), self._meta_path(key)):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass