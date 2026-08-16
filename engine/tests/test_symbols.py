"""Symbol extraction / normalization contract (bridge GET_CANDLES path)."""

import pytest

from bridge import normalize_symbol

import pandas as pd
from cache import DiskCache


def test_normalize_symbol_fx():
    assert normalize_symbol("EUR/USD") == "EURUSD"
    assert normalize_symbol("gbpusd") == "GBPUSD"
    assert normalize_symbol("  btc-usd ") == "BTC-USD"


def test_normalize_symbol_empty():
    # Empty/missing symbol must normalize to empty (the bridge rejects it)
    assert normalize_symbol("") == ""
    assert normalize_symbol(None) == ""


def test_normalize_symbol_already_clean():
    assert normalize_symbol("US30") == "US30"
    assert normalize_symbol("TSLA") == "TSLA"


def test_disk_cache_key_uses_normalized_symbol():
    """Cached keys are built from the normalized symbol+limit form."""
    df = pd.DataFrame({"close": [1.0, 2.0, 3.0]})
    d = DiskCache(ttl_seconds=60)
    key = f"{normalize_symbol('EUR/USD')}:500"
    d.put(key, df)
    got = d.get(key)
    d.invalidate(key)
    assert got is not None and len(got) == 3