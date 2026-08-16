"""Paper trading adapter — the default broker.

Keeps an in-memory position set so the app exercises the exact same
position-lifecycle paths as a real broker: executions create positions,
closes remove them, and every change fires ``position_change_cb`` (which
the engine republishes on the ``positions`` topic so the backend/UI stay in
sync).  The first paper ticket is 12345678 for continuity with the
historical mock; later tickets increment so each position is individually
trackable.  The account reports as disconnected with zeroed balances.
"""

import logging

from .base import BrokerAdapter

logger = logging.getLogger(__name__)


class MockBrokerAdapter(BrokerAdapter):
    name = "mock"

    def __init__(self, symbols: list[str] | None = None):
        self._symbols = list(symbols or [])
        self._positions: list[dict] = []
        self._next_ticket = 12345678
        self.position_change_cb = None

    async def connect(self) -> None:
        # Nothing to do — always "connected" to paper trading.
        pass

    async def run(self) -> None:
        # No background connection work needed.
        pass

    async def disconnect(self) -> None:
        pass

    async def _notify_positions(self) -> None:
        cb = self.position_change_cb
        if cb:
            try:
                await cb(list(self._positions))
            except Exception as e:  # noqa: BLE001
                logger.warning("Mock positions callback error: %s", e)

    async def execute_market_order(
        self,
        symbol: str,
        action: str,
        volume_lots: float = 0.01,
        sl: float | None = None,
        tp: float | None = None,
        comment: str = "",
    ) -> dict:
        ticket = self._next_ticket
        self._next_ticket += 1
        position = {
            "position_id": f"mock-{ticket}",
            "symbol": symbol,
            "side": str(action).upper(),
            "volume": volume_lots,
            "price": 0.0,
            "stop_loss": sl,
            "take_profit": tp,
            "label": comment,
        }
        self._positions.append(position)
        logger.info(
            "Paper trade: %s %s %.2f lot (sl=%s tp=%s) -> position %s",
            symbol, action, volume_lots, sl, tp, position["position_id"],
        )
        await self._notify_positions()
        return {
            "status": "mock_filled",
            "ticket": ticket,
            "position_id": position["position_id"],
            "volume": volume_lots,
            "price": 0.0,
            "message": "paper trade (mock broker)",
        }

    async def close_position(
        self, position_id, volume_lots: float | None = None
    ) -> dict:
        logger.info("Paper close: position %s volume %s", position_id, volume_lots)
        before = len(self._positions)
        self._positions = [
            p for p in self._positions if str(p.get("position_id")) != str(position_id)
        ]
        if len(self._positions) != before:
            await self._notify_positions()
        return {"status": "mock_closed", "position_id": position_id, "ticket": None}

    async def get_account_info(self) -> dict:
        return {
            "connected": False,
            "account": None,
            "server": None,
            "balance": 0.0,
            "equity": 0.0,
            "currency": None,
            "provider": "mock",
            "mode": "paper",
            "message": "paper trading — set BROKER_PROVIDER=ctrader for a real account",
        }

    async def get_positions(self) -> list:
        return list(self._positions)

    async def get_pending_orders(self) -> list:
        return []

    def shutdown(self) -> None:
        pass
