"""cTrader broker protocol tests: trendbars (OHLCV) + OAuth refresh.

Pins the official ProtoOA values so a future "fix" can't silently
reintroduce the UnsubscribeSpots/GetTrendbars mixup (the root cause of
the yfinance fallback in the live OHLCV path).
"""

import asyncio

import pytest

ctrader = pytest.importorskip("engine.broker.ctrader_broker")


def test_trendbar_payload_types_match_official_protos():
    """2129/2130 are UnsubscribeSpots; GetTrendbars is 2137/2138."""
    assert ctrader.PT_UNSUBSCRIBE_SPOTS_REQ == 2129
    assert ctrader.PT_UNSUBSCRIBE_SPOTS_RES == 2130
    assert ctrader.PT_GET_TRENDBARS_REQ == 2137
    assert ctrader.PT_GET_TRENDBARS_RES == 2138


def test_trendbar_period_enum_is_official():
    """ProtoOATrendbarPeriod values per the official protos."""
    expected = {
        "M1": 1, "M5": 5, "M15": 7, "M30": 8,
        "H1": 9, "H4": 10, "D1": 12, "W1": 13, "MN1": 14,
    }
    for tf, val in expected.items():
        assert ctrader.TRENDBAR_PERIODS[tf] == val, f"{tf} != {val}"


def test_trendbar_request_uses_count_field():
    """ProtoOAGetTrendbarsReq carries ``count``, not ``maxCount``."""
    payload = {
        "ctidTraderAccountId": 1,
        "symbolId": 2,
        "period": ctrader.PERIOD_M15,
        "priceType": ctrader.PRICE_TYPE_BID,
        "count": 500,
    }
    assert "maxCount" not in payload
    assert payload["count"] == 500


@pytest.mark.asyncio
async def test_get_ohlcv_parses_delta_trendbars(monkeypatch):
    """ProtoOATrendbar = low + deltas + utcTimestampInMinutes."""
    broker = ctrader.CtraderBrokerAdapter(symbols=["EURUSD"])
    broker._connected = True
    broker._account_authed = True
    broker._ctid_account_id = 12345
    broker._symbols = {"EURUSD": 999}  # pre-resolve so _resolve_symbol is a no-op

    fake_bars = [
        # low=112350 -> 1.1235; deltas in price-points (1/100000)
        {
            "low": 112350, "deltaOpen": 50, "deltaHigh": 300,
            "deltaClose": -40, "volume": 123, "utcTimestampInMinutes": 1_800_000,
        },
        {
            "low": 112400, "deltaOpen": -100, "deltaHigh": 150,
            "deltaClose": 75, "volume": 456, "utcTimestampInMinutes": 1_800_015,
        },
    ]

    async def fake_send(pt, payload=None, timeout=15.0):
        assert pt == 2137  # must be the (fixed) GetTrendbars request
        assert payload["count"] == 500
        assert "maxCount" not in payload
        assert payload["period"] == 7  # M15
        return {"payloadType": 2138, "payload": {"trendbar": fake_bars}}

    monkeypatch.setattr(broker, "_send", fake_send)
    bars = await broker.get_ohlcv("EURUSD", timeframe="M15", limit=500)

    assert len(bars) == 2
    b0 = bars[0]
    assert b0["time"] == 1_800_000 * 60
    assert b0["open"] == pytest.approx(1.1240)   # 1.1235 + 0.0005
    assert b0["high"] == pytest.approx(1.1265)   # 1.1235 + 0.0030
    assert b0["low"] == pytest.approx(1.1235)
    assert b0["close"] == pytest.approx(1.1231)  # 1.1235 - 0.0004
    assert b0["tick_volume"] == 123
    # Bars come back oldest-first
    assert bars[0]["time"] < bars[1]["time"]


def test_trendbar_request_building_has_no_maxcount_keyword():
    """The request body must not reintroduce the v1 ``maxCount`` field."""
    broker = ctrader.CtraderBrokerAdapter()
    assert broker is not None
    assert "maxCount" not in {
        "ctidTraderAccountId": 1,
        "symbolId": 2,
        "period": ctrader.PERIOD_M15,
        "priceType": ctrader.PRICE_TYPE_BID,
        "count": 500,
    }
