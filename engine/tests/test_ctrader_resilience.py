"""cTrader broker resilience tests.

Locks in two live-smoke findings from 2026-08-08:

1. Reconnect survival: when the transport is torn down (reconnect), pending
   request futures are cancelled. ``_send`` must surface
   BrokerDisconnectedError — never asyncio.CancelledError (a BaseException
   that escapes ``except Exception`` handlers) — so the bridge scan loop
   degrades instead of dying mid-cycle.

2. Symbol resolution against the live account list: logical names (US30,
   AAPL, ...) resolve through broker-specific display names ("US 30",
   "APPLE") and are remembered so ticks/positions carry the logical name;
   unresolvable symbols are recorded in ``unmapped_symbols`` (fail-closed).
"""

import asyncio

import pytest

ctrader = pytest.importorskip("engine.broker.ctrader_broker")


@pytest.mark.asyncio
async def test_send_cancelled_future_degrades_to_disconnect(monkeypatch):
    """Transport teardown cancels pending request futures; _send must raise
    BrokerDisconnectedError, never CancelledError."""
    broker = ctrader.CtraderBrokerAdapter()
    broker._connected = True
    broker._account_authed = True
    broker._writer = object()  # makes _transport_open() True

    async def fake_write(_envelope):
        pass

    monkeypatch.setattr(broker, "_write", fake_write)

    send_task = asyncio.create_task(broker._send(2137, {"count": 1}, timeout=30.0))
    # Wait until the pending reply future is registered...
    for _ in range(200):
        if broker._pending:
            break
        await asyncio.sleep(0.01)
    assert broker._pending, "request future was never registered"

    # ...then simulate transport teardown (reconnect) cancelling it.
    await broker._close_transport()

    with pytest.raises(ctrader.BrokerDisconnectedError):
        await send_task


@pytest.mark.asyncio
async def test_resolve_symbol_uses_account_display_name(monkeypatch):
    """US30 resolves to the account's display name "US 30" (verified live on
    the demo account) and is remembered as the logical symbol."""
    broker = ctrader.CtraderBrokerAdapter(symbols=["US30"])
    broker._connected = True
    broker._account_authed = True
    broker._symbols = {"US 30": 42, "EURUSD": 7}

    async def fake_send(pt, payload=None, timeout=15.0):
        assert pt == ctrader.PT_SYMBOLS_LIST_REQ
        return {"payloadType": ctrader.PT_SYMBOLS_LIST_RES, "payload": {"symbol": []}}

    monkeypatch.setattr(broker, "_send", fake_send)

    sid = await broker._resolve_symbol("US30")
    assert sid == 42
    assert broker._symbol_id_to_logical[42] == "US30"
    assert broker.unmapped_symbols == set()


@pytest.mark.asyncio
async def test_unmapped_symbol_recorded_fail_closed(monkeypatch):
    """A logical symbol with no exact name or alias on the account is
    recorded in unmapped_symbols and raises — never fabricated."""
    broker = ctrader.CtraderBrokerAdapter(symbols=["NOSUCHSYM"])
    broker._connected = True
    broker._account_authed = True
    broker._symbols = {"EURUSD": 7}

    async def fake_send(pt, payload=None, timeout=15.0):
        return {"payloadType": ctrader.PT_SYMBOLS_LIST_RES, "payload": {"symbol": []}}

    monkeypatch.setattr(broker, "_send", fake_send)

    with pytest.raises(ctrader.BrokerError):
        await broker._resolve_symbol("NOSUCHSYM")
    assert "NOSUCHSYM" in broker.unmapped_symbols
