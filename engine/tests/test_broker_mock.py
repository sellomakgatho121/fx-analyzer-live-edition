"""MockBrokerAdapter lifecycle tests — the paper-trading broker contract.

Pins the documented BrokerAdapter execution contract (see broker/base.py):
fills return ``status: "mock_filled"`` with an int ``ticket`` and a
``mock-<ticket>`` ``position_id``; every position change fires
``position_change_cb``.
"""

import asyncio

import pytest

from engine.broker.base import BrokerAdapter, BrokerError
from engine.broker.mock_broker import MockBrokerAdapter


@pytest.fixture
def broker():
    return MockBrokerAdapter(symbols=["EURUSD", "BTCUSD"])


@pytest.mark.asyncio
async def test_execute_creates_position(broker):
    res = await broker.execute_market_order("EURUSD", "BUY", volume_lots=0.1)
    assert res["status"] == "mock_filled"
    assert res["ticket"] == 12345678  # first paper ticket for continuity
    assert res["position_id"] == "mock-12345678"
    positions = await broker.get_positions()
    assert len(positions) == 1
    assert positions[0]["symbol"] == "EURUSD"
    assert positions[0]["side"] == "BUY"


@pytest.mark.asyncio
async def test_tickets_increment(broker):
    await broker.execute_market_order("EURUSD", "BUY")
    await broker.execute_market_order("BTCUSD", "SELL")
    tickets = sorted(int(p["position_id"].split("-")[1]) for p in await broker.get_positions())
    assert tickets == [12345678, 12345679]


@pytest.mark.asyncio
async def test_position_change_cb_fires(broker):
    seen = []

    async def cb(positions):
        seen.append(list(positions))

    broker.position_change_cb = cb
    await broker.execute_market_order("EURUSD", "BUY")
    await asyncio.sleep(0.01)
    assert len(seen) == 1 and seen[0][0]["symbol"] == "EURUSD"

    # Closing removes the position and fires again
    pos = (await broker.get_positions())[0]
    await broker.close_position(pos["position_id"])
    await asyncio.sleep(0.01)
    assert len(seen) == 2 and seen[1] == []


@pytest.mark.asyncio
async def test_paper_broker_fills_any_symbol(broker):
    """Symbol gating lives at the bridge/real-broker layer, not in paper mode."""
    res = await broker.execute_market_order("NOPEUSD", "BUY")
    assert res["status"] == "mock_filled"
    assert len(await broker.get_positions()) == 1


@pytest.mark.asyncio
async def test_close_unknown_position_is_safe(broker):
    await broker.close_position("99999999")
    assert await broker.get_positions() == []


def test_implements_full_adapter_interface():
    """BrokerAdapter mocks must satisfy the abstract contract (no stubs)."""
    missing = BrokerAdapter.__abstractmethods__ - set(dir(MockBrokerAdapter))
    assert not missing, f"mock does not implement: {missing}"


def test_error_hierarchy():
    assert issubclass(BrokerError, Exception)
