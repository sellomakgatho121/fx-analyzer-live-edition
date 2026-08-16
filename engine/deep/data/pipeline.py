"""Multi-modal data pipeline — unified access to market + alternative data.

Provides:
  - MultiModalDataPipeline: fetch OHLCV, technical indicators, alternative data
  - FeatureStore: in-memory cache with TTL

References from awesome-deep-trading: Alpha Vantage, Quandl, Alternative Data APIs.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FeatureStore — in-memory cache with TTL
# ---------------------------------------------------------------------------

@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


class FeatureStore:
    """Simple in-memory cache with per-key TTL.

    Thread-safe for concurrent async access (asyncio runs on one thread,
    so no lock needed for coroutines). Use for caching API responses,
    model predictions, and precomputed features.
    """

    def __init__(self) -> None:
        self._store: dict[str, _CacheEntry] = {}

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        if time.monotonic() > entry.expires_at:
            del self._store[key]
            return None
        return entry.value

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        self._store[key] = _CacheEntry(value, time.monotonic() + ttl_seconds)

    def clear(self) -> None:
        self._store.clear()

    def cached(self, ttl_seconds: int = 300) -> Callable:
        """Decorator: cache the return value of an async function.

        The cache key is derived from the function name + positional
        and keyword arguments so identical calls reuse the cached result.
        """
        def decorator(fn: Callable) -> Callable:
            async def wrapper(*args: Any, **kwargs: Any) -> Any:
                key = f"{fn.__name__}:{args}:{sorted(kwargs.items())}"
                existing = self.get(key)
                if existing is not None:
                    return existing
                result = await fn(*args, **kwargs)
                self.set(key, result, ttl_seconds)
                return result
            return wrapper
        return decorator


# ---------------------------------------------------------------------------
# Data Pipeline
# ---------------------------------------------------------------------------

class MultiModalDataPipeline:
    """Unified access to OHLCV, technical indicators, and alternative data.

    Data sources (all optional):
      - yfinance   — free OHLCV (no key needed)
      - Alpha Vantage — technical indicators via ``ALPHA_VANTAGE_KEY`` env var
      - FRED       — economic indicators via ``FRED_API_KEY`` env var
      - Google Trends — search interest via pytrends (optional dep)
      - Fear & Greed — web scrape from alternative.me

    Every fetch method returns partial data on failure so the pipeline never
    blocks the trading analysis loop.
    """

    def __init__(self) -> None:
        self.store = FeatureStore()
        self._alpha_key = os.getenv("ALPHA_VANTAGE_KEY", "")
        self._fred_key = os.getenv("FRED_API_KEY", "")          # FRED API
        self._quandl_key = os.getenv("QUANDL_KEY", "")

    # ------------------------------------------------------------------
    # Market Data
    # ------------------------------------------------------------------

    async def fetch_market_data(self, symbol: str, days: int = 365) -> pd.DataFrame:
        """Return a DataFrame with OHLCV + Alpha Vantage technical indicators.

        Primary source is yfinance (no key needed). If ``ALPHA_VANTAGE_KEY``
        is set, SMA(20), EMA(20), RSI(14), MACD, and BBands(20,2) are
        appended as extra columns.
        """
        cache_key = f"market_data:{symbol}:{days}"
        cached = self.store.get(cache_key)
        if cached is not None:
            return cached

        df = await self._fetch_yfinance(symbol, days)

        # Augment with Alpha Vantage technical indicators if key is set
        if self._alpha_key and len(df) > 30:
            ta = await self._fetch_alpha_technicals(symbol)
            if ta is not None and not ta.empty:
                for col in ta.columns:
                    df[col] = ta[col]

        self.store.set(cache_key, df, ttl_seconds=300)
        return df

    # -- yfinance OHLCV ---------------------------------------------------

    async def _fetch_yfinance(self, symbol: str, days: int) -> pd.DataFrame:
        loop = asyncio.get_event_loop()
        try:
            ticker = yf.Ticker(symbol)
            df = await loop.run_in_executor(
                None, lambda: ticker.history(period=f"{days}d")
            )
            if df.empty:
                return pd.DataFrame()
            return df
        except Exception as exc:
            logger.warning("yfinance fetch failed for %s: %s", symbol, exc)
            return pd.DataFrame()

    # -- Alpha Vantage technical indicators -------------------------------

    async def _fetch_alpha_technicals(self, symbol: str) -> pd.DataFrame | None:
        """Fetch SMA, EMA, RSI, MACD, BBands from Alpha Vantage.

        Each indicator is fetched in its own HTTP call.  If any single
        fetch fails we log a warning and return whatever we collected.
        """
        if not self._alpha_key:
            return None

        # Mapping: indicator name → AV function name
        indicators = {
            "SMA":  {"function": "SMA",  "interval": "daily", "time_period": 20, "series": "Technical Analysis: SMA"},
            "EMA":  {"function": "EMA",  "interval": "daily", "time_period": 20, "series": "Technical Analysis: EMA"},
            "RSI":  {"function": "RSI",  "interval": "daily", "time_period": 14, "series": "Technical Analysis: RSI"},
            "MACD": {"function": "MACD", "interval": "daily", "series": "Technical Analysis: MACD", "params": {"fastperiod": 12, "slowperiod": 26, "signalperiod": 9}},
            "BBANDS": {"function": "BBANDS", "interval": "daily", "time_period": 20, "series": "Technical Analysis: BBANDS", "params": {"nbdevup": 2, "nbdevdn": 2}},
        }

        try:
            import aiohttp
            results: dict[str, pd.Series] = {}

            async def _fetch_one(name: str, cfg: dict) -> None:
                params = {
                    "function": cfg["function"],
                    "symbol": symbol,
                    "interval": cfg.get("interval", "daily"),
                    "apikey": self._alpha_key,
                }
                if "time_period" in cfg:
                    params["time_period"] = str(cfg["time_period"])
                if "params" in cfg:
                    params.update(cfg["params"])
                if "series_type" in cfg:
                    params["series_type"] = "close"

                url = "https://www.alphavantage.co/query"
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                        if resp.status != 200:
                            return
                        data = await resp.json()

                series_data = data.get(cfg.get("series", ""))
                if not series_data:
                    # MACD has a nested key structure
                    if name == "MACD":
                        series_data = data.get("Technical Analysis: MACD")
                    return

                # Parse time-series dict → pd.Series
                records = []
                for date_str, vals in series_data.items():
                    if name == "MACD":
                        val = float(vals.get("MACD", 0))
                    elif name == "BBANDS":
                        val = float(vals.get("Real Upper Band", 0))
                        # We'll store upper band, save other bands separately
                        records.append((date_str, "BBANDS_UPPER", float(vals.get("Real Upper Band", 0))))
                        records.append((date_str, "BBANDS_MIDDLE", float(vals.get("Real Middle Band", 0))))
                        records.append((date_str, "BBANDS_LOWER", float(vals.get("Real Lower Band", 0))))
                        continue
                    else:
                        val_key = [k for k in vals if k.startswith(cfg["function"])][0]
                        val = float(vals[val_key])
                    records.append((date_str, name, val))

                if not records:
                    return

                pdf = pd.DataFrame(records, columns=["date", "indicator", "value"])
                pdf["date"] = pd.to_datetime(pdf["date"])
                for ind_name, group in pdf.groupby("indicator"):
                    grp = group.set_index("date")["value"].sort_index()
                    results[ind_name] = grp

            # Fetch all indicators concurrently
            tasks = [_fetch_one(n, c) for n, c in indicators.items()]
            await asyncio.gather(*tasks)

            if not results:
                return None

            ta_df = pd.DataFrame(results)
            # Forward-fill any missing days (AV data may have gaps)
            ta_df = ta_df.ffill()
            return ta_df

        except Exception as exc:
            logger.warning("Alpha Vantage technicals failed for %s: %s", symbol, exc)
            return None

    # ------------------------------------------------------------------
    # Alternative Data
    # ------------------------------------------------------------------

    async def fetch_alternative_data(self, symbol: str) -> dict[str, Any]:
        """Return dict of alternative data signals for *symbol*.

        Includes:
          - ``fear_greed_index`` — CNN Fear & Greed score + rating
          - ``google_trends`` — weekly search interest (if pytrends installed)
          - ``economic_indicators`` — FRED snapshot (if ``FRED_API_KEY`` set)

        All fields are optional — failures produce ``None`` entries.
        """
        cache_key = f"alt_data:{symbol}"
        cached = self.store.get(cache_key)
        if cached is not None:
            return cached

        # Run independent fetches concurrently
        fg_task = asyncio.create_task(self._fetch_fear_greed())

        gt_task = None
        if self._pytrends_available():
            gt_task = asyncio.create_task(self._fetch_google_trends(symbol))

        fred_task = None
        if self._fred_key:
            fred_task = asyncio.create_task(self._fetch_fred_indicators())

        results: dict[str, Any] = {
            "fear_greed_index": None,
            "google_trends": None,
            "economic_indicators": None,
        }

        results["fear_greed_index"] = await fg_task

        if gt_task is not None:
            results["google_trends"] = await gt_task
        if fred_task is not None:
            results["economic_indicators"] = await fred_task

        self.store.set(cache_key, results, ttl_seconds=600)
        return results

    # -- Fear & Greed Index ------------------------------------------------

    async def _fetch_fear_greed(self) -> dict[str, Any] | None:
        """Scrape Fear & Greed Index from alternative.me."""
        try:
            import aiohttp
            url = "https://api.alternative.me/fng/?limit=1"
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status != 200:
                        return None
                    data = await resp.json()
            entries = data.get("data", [])
            if not entries:
                return None
            score = entries[0].get("value")
            classification = entries[0].get("value_classification", "neutral")
            if score is not None:
                return {
                    "score": float(score),
                    "rating": classification.lower().replace(" ", "_"),
                }
            return None
        except Exception as exc:
            logger.debug("Fear & Greed fetch failed: %s", exc)
            return None

    # -- Google Trends -----------------------------------------------------

    @staticmethod
    def _pytrends_available() -> bool:
        try:
            import pytrends  # noqa: F401
            return True
        except ImportError:
            return False

    async def _fetch_google_trends(self, symbol: str) -> dict[str, Any] | None:
        """Fetch weekly search interest from Google Trends via pytrends.

        Returns the last 52 weeks of interest data as a list of
        ``{"week": "YYYY-MM-DD", "interest": int}`` entries,
        or ``None`` if pytrends is not installed / the request fails.
        """
        try:
            from pytrends.request import TrendReq

            loop = asyncio.get_event_loop()

            def _fetch() -> list[dict[str, Any]] | None:
                # pytrends is synchronous — offload to executor
                ptrends = TrendReq(hl="en-US", tz=360)
                kw = [f"{symbol} stock"]
                ptrends.build_payload(kw, cat=0, timeframe="today 12-m", geo="", gprop="")
                df = ptrends.interest_over_time()
                if df is None or df.empty:
                    return None
                # Normalise column name
                col = kw[0]
                if col not in df.columns:
                    return None
                records = []
                for idx, row in df.iterrows():
                    records.append({
                        "week": idx.strftime("%Y-%m-%d"),
                        "interest": int(row[col]),
                    })
                return records[-52:]  # last 52 weeks

            result = await loop.run_in_executor(None, _fetch)
            return result
        except Exception as exc:
            logger.debug("Google Trends fetch failed for %s: %s", symbol, exc)
            return None

    # -- FRED Economic Indicators ------------------------------------------

    async def _fetch_fred_indicators(self) -> dict[str, Any] | None:
        """Fetch key economic indicators from FRED.

        Series fetched (all optional):
          - UNRATE: unemployment rate
          - FEDFUNDS: federal funds rate
          - CPI: consumer price index (monthly change)
          - GDP: real GDP (quarterly)
          - DGS10: 10-year Treasury yield
          - SP500: S&P 500 index level

        Only series that return valid data are included.
        """
        if not self._fred_key:
            return None

        series_ids = {
            "unemployment_rate": "UNRATE",
            "fed_funds_rate": "FEDFUNDS",
            "cpi": "CPIAUCSL",
            "gdp": "GDP",
            "treasury_10y": "DGS10",
            "sp500": "SP500",
        }

        try:
            import aiohttp

            results: dict[str, Any] = {}

            async def _fetch_one(name: str, series_id: str) -> None:
                url = (
                    "https://api.stlouisfed.org/fred/series/observations"
                    f"?series_id={series_id}"
                    f"&api_key={self._fred_key}"
                    "&file_type=json"
                    "&sort_order=desc"
                    "&limit=2"  # latest two observations
                )
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status != 200:
                            return
                        data = await resp.json()

                observations = data.get("observations", [])
                if not observations:
                    return

                # Latest non-"." value
                latest = None
                prev = None
                for obs in observations:
                    val = obs.get("value", ".")
                    if val != ".":
                        if latest is None:
                            latest = float(val)
                            latest_date = obs.get("date", "")
                        elif prev is None:
                            prev = float(val)

                if latest is not None:
                    entry: dict[str, Any] = {
                        "value": latest,
                        "date": latest_date,
                    }
                    if prev is not None and prev != 0:
                        entry["change_pct"] = round((latest - prev) / prev * 100, 2)
                    results[name] = entry

            tasks = [_fetch_one(n, sid) for n, sid in series_ids.items()]
            await asyncio.gather(*tasks)

            return results if results else None

        except Exception as exc:
            logger.debug("FRED fetch failed: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        self.store.clear()
