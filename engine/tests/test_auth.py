"""Auth-path tests: broker credential/token validation raises BrokerAuthError.

The engine's auth surface is the broker connection layer (the REST/JWT
middleware lives in the Node backend, covered by Phase 2's live checks).
"""

import pytest

from engine.broker.base import BrokerAuthError, BrokerError, BrokerDisconnectedError


def test_auth_error_hierarchy():
    assert issubclass(BrokerAuthError, BrokerError)
    assert issubclass(BrokerDisconnectedError, BrokerError)


def test_auth_error_message_surfaces_code():
    err = BrokerAuthError("cTrader auth error 2102: not authorized")
    assert "2102" in str(err)


def test_ctrader_handshake_requires_credentials(monkeypatch):
    ctrader = pytest.importorskip("engine.broker.ctrader_broker")
    monkeypatch.delenv("CTRADER_CLIENT_ID", raising=False)
    monkeypatch.delenv("CTRADER_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("CTRADER_ACCESS_TOKEN", raising=False)

    broker = ctrader.CtraderBrokerAdapter()
    with pytest.raises(BrokerAuthError, match="CTRADER_CLIENT_ID"):
        asyncio_run(broker._handshake())


def asyncio_run(coro):
    import asyncio

    return asyncio.run(coro)