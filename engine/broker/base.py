"""Broker adapter abstraction for the FX Analyzer engine.

Every execution backend (paper mock, cTrader Open API) implements
:class:`BrokerAdapter`.  The engine talks to brokers only through this
interface, so trade execution, positions and account status stay
decoupled from the underlying platform.
"""

import abc
import logging

logger = logging.getLogger(__name__)


class BrokerError(Exception):
    """Base error for all broker failures."""


class BrokerAuthError(BrokerError):
    """Credentials rejected, token missing/expired, or app not approved."""


class BrokerDisconnectedError(BrokerError):
    """No live connection to the broker."""


class BrokerTimeoutError(BrokerError):
    """Broker did not answer within the expected time."""


class BrokerAdapter(abc.ABC):
    """Interface every broker backend must implement."""

    name = "base"
    """Provider name, e.g. 'mock' or 'ctrader'."""

    # Optional callbacks wired by the engine:
    tick_cb = None
    """async callable(spot: dict) -> None — called for real-time quotes."""
    position_change_cb = None
    """async callable(positions: list) -> None — called after any position change."""

    @abc.abstractmethod
    async def connect(self) -> None:
        """Open a connection and authenticate. Raises BrokerError on failure."""

    @abc.abstractmethod
    async def run(self) -> None:
        """Background task: keep the broker connected (reconnect loop).

        Must never raise — it logs and retries until shutdown().
        """

    @abc.abstractmethod
    async def disconnect(self) -> None:
        """Close the connection cleanly."""

    @abc.abstractmethod
    async def execute_market_order(
        self,
        symbol: str,
        action: str,
        volume_lots: float = 0.01,
        sl: float | None = None,
        tp: float | None = None,
        comment: str = "",
    ) -> dict:
        """Place a market order.

        Returns ``{"status": "filled", "ticket": <id>,
        "position_id": <id>, "volume": <filled lots>, "price": <fill>,
        "message": ...}`` — or ``{"status": "mock_filled", "ticket": ...}``
        for paper execution.  Raises BrokerError when rejected.
        """

    @abc.abstractmethod
    async def close_position(
        self, position_id, volume_lots: float | None = None
    ) -> dict:
        """Close an open position (fully, or ``volume_lots`` of it).

        Returns ``{"status": "closed", "position_id": ..., "ticket": ...}``.
        """

    @abc.abstractmethod
    async def get_account_info(self) -> dict:
        """Account snapshot:

        ``{"connected": bool, "account": <login>, "server": <name>,
        "balance": float, "equity": float, "currency": str|None,
        "provider": str, "mode": "demo"|"live"|"paper", "message": str|None}``
        """

    @abc.abstractmethod
    async def get_positions(self) -> list:
        """Open positions as a list of normalized dicts."""

    @abc.abstractmethod
    async def get_pending_orders(self) -> list:
        """Active pending orders as a list of normalized dicts."""

    def shutdown(self) -> None:
        """Best-effort synchronous close (called on engine exit)."""
        logger.warning("broker %s: shutdown() not implemented", self.name)
