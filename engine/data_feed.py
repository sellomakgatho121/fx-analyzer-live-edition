import asyncio
import logging
import time

import pandas as pd

# Live OHLCV comes exclusively from the cTrader Open API via the attached
# broker adapter. There is deliberately NO fallback here: when cTrader
# cannot serve bars, fetch_data_async returns None and the caller fails
# closed (degrades) instead of fabricating or pulling external data.
# Research-only consumers (vibe research, deep-model training) use
# `research_data.py`, which is explicitly non-live and real_only.

class DataFeed:
    """
    Live OHLCV ingestion — cTrader Open API only (via the broker adapter).

    ``last_source`` is read by the engine bridge to report feed state and
    to flag payloads: "ctrader" (real) | "unavailable" (nothing served).
    Never "mock" — the live feed does not fabricate bars.
    """
    def __init__(self):
        self.broker = None
        # Source of the most recent fetch: "ctrader" | "unavailable" |
        # "unknown". Read by the engine bridge and /health.
        self.last_source = "unknown"
        # Monotonic time of the last successful real-bar fetch. /health must
        # not report the whole feed down because a single symbol failed mid
        # cycle; only flip to "unavailable" once success is stale.
        self.last_success_at = 0.0

    # A feed is considered live until no real bar has arrived for this long
    # (well beyond the ~3s scan cadence and the 60s symbols refresh).
    _FEED_STALE_AFTER = 120.0

    def set_broker(self, broker) -> None:
        """Attach the broker adapter; its get_ohlcv() is the live feed."""
        self.broker = broker
        if getattr(broker, "get_ohlcv", None) is None:
            logging.warning(
                "DataFeed: broker has no get_ohlcv() — live OHLCV unavailable "
                "(only cTrader can serve live bars)"
            )

    async def fetch_data_async(
        self, symbol: str, timeframe=None, limit=500, real_only=False
    ) -> pd.DataFrame | None:
        """Fetch OHLCV from the cTrader broker adapter.

        Returns a DataFrame (columns time/open/high/low/close/tick_volume)
        or ``None`` when no real cTrader bars could be obtained — the
        caller must degrade, never invent. ``real_only`` is accepted for
        interface compatibility; live data is always real.
        """
        if self.broker is not None and getattr(self.broker, "get_ohlcv", None) is not None:
            try:
                bars = await self.broker.get_ohlcv(
                    symbol, timeframe=timeframe or "M15", limit=limit
                )
                if bars:
                    df = pd.DataFrame(bars)
                    df['time'] = pd.to_datetime(df['time'], unit='s')
                    logging.info(f"DataFeed: fetched {len(df)} cTrader bars for {symbol}")
                    self.last_source = "ctrader"
                    self.last_success_at = time.monotonic()
                    return df[['time', 'open', 'high', 'low', 'close', 'tick_volume']]
                logging.warning(f"DataFeed: no cTrader bars for {symbol}")
            except Exception as e:
                logging.error(f"DataFeed: cTrader get_ohlcv error for {symbol}: {e}")
        else:
            logging.warning(f"DataFeed: no cTrader broker attached for {symbol}")
        if time.monotonic() - self.last_success_at > self._FEED_STALE_AFTER:
            self.last_source = "unavailable"
        return None

    def shutdown(self):
        pass  # the broker adapter owns the connection; DataFeed has nothing to close
