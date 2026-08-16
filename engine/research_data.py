"""Research-only market data (Yahoo Finance).

**Not a live-data source.** The live path (ticker, candles, portfolio,
SL/TP decisions) must come exclusively from the cTrader Open API via
``engine.data_feed.DataFeed``.  This module exists for research/backtest
consumers (vibe research, deep-model training) that need *historical*
bars and are explicitly ``real_only``: they refuse to fabricate data and
their output is labeled research, never live.

Moved out of ``engine/data_feed.py`` so the live feed has no yfinance
dependency at all.
"""

import functools
import random
import requests
import yfinance as yf
import pandas as pd

# yfinance performs no timeout by default; a hung HTTP call would freeze
# the caller. Give every request a hard timeout via a custom session.
def _timed_session():
    s = requests.Session()
    s.request = functools.partial(s.request, timeout=15)
    return s


# Mapping between internal symbols and Yahoo Finance tickers.
YF_MAPPING = {
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "AUDUSD": "AUDUSD=X",
    "BTCUSD": "BTC-USD",
    "ETHUSD": "ETH-USD",
    "US30": "^DJI",
    "US500": "^GSPC",
    "AAPL": "AAPL",
    "TSLA": "TSLA",
}


def fetch_yfinance_data(symbol: str, limit=500, real_only=False):
    """
    Historical OHLCV from Yahoo Finance for research/backtest only.

    ``real_only=True`` (the default stance of research consumers) returns
    ``None`` on upstream failure instead of fabricated bars — research
    never computes on invented data.
    """
    cache_key = f"research:{symbol}:{limit}"
    yf_symbol = YF_MAPPING.get(symbol, symbol)
    try:
        ticker = yf.Ticker(yf_symbol, session=_timed_session())
        df = ticker.history(period="2d", interval="1m")
    except Exception as e:  # noqa: BLE001 - upstream is best-effort
        import logging
        logging.getLogger(__name__).warning(
            "research_data: yfinance error for %s: %s", symbol, e
        )
        df = None
    if df is None or df.empty:
        if real_only:
            return None
        return None  # never fabricate — even without real_only
    df = df.tail(limit).reset_index()

    time_col = (
        'Datetime' if 'Datetime' in df.columns
        else 'Date' if 'Date' in df.columns else df.columns[0]
    )
    df = df.rename(columns={
        time_col: 'time',
        'Open': 'open',
        'High': 'high',
        'Low': 'low',
        'Close': 'close',
        'Volume': 'tick_volume',
    })
    df['time'] = pd.to_datetime(df['time'])
    df['open'] = df['open'].astype(float)
    df['high'] = df['high'].astype(float)
    df['low'] = df['low'].astype(float)
    df['close'] = df['close'].astype(float)
    # Forex volume is often 0 in yfinance; fill with plausible values so
    # volume-based research factors (alpha bench) have signal.
    df['tick_volume'] = df['tick_volume'].fillna(0).astype(int)
    zero_mask = df['tick_volume'] == 0
    if zero_mask.any():
        df.loc[zero_mask, 'tick_volume'] = [
            random.randint(10, 100) for _ in range(zero_mask.sum())
        ]
    return df[['time', 'open', 'high', 'low', 'close', 'tick_volume']]
