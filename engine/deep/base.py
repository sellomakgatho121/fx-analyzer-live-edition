"""Base classes for deep learning agents that plug into the TradingAgents pipeline.

All deep agents follow the same interface:
    async def analyze(symbol: str, context: dict | None = None) -> dict:

The returned dict is merged into the AgentState by AgentAnalysisBridge.
"""

from __future__ import annotations

import abc
import logging
from typing import Any

logger = logging.getLogger(__name__)


class DeepAgent(abc.ABC):
    """Abstract base for any deep-learning agent inside engine/deep/."""

    def __init__(self, name: str) -> None:
        self.name = name
        self._loaded = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def load(self) -> bool:
        """Lazy-load model weights / initialise connections. Called once."""
        if self._loaded:
            return True
        try:
            self._loaded = await self._load_impl()
            return self._loaded
        except Exception as exc:
            logger.warning("%s.load() failed: %s", self.name, exc)
            return False

    async def analyze(self, symbol: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run inference and return a dict with 'report', 'confidence', etc."""
        if not self._loaded:
            ok = await self.load()
            if not ok:
                return {"error": f"{self.name} not loaded", "confidence": 0.0}
        try:
            return await self._analyze_impl(symbol, context or {})
        except Exception as exc:
            logger.exception("%s.analyze(%s) failed", self.name, symbol)
            return {"error": str(exc), "confidence": 0.0}

    # ------------------------------------------------------------------
    # Subclass hooks
    # ------------------------------------------------------------------

    @abc.abstractmethod
    async def _load_impl(self) -> bool:
        """Subclass model loading — return True on success."""

    @abc.abstractmethod
    async def _analyze_impl(self, symbol: str, context: dict[str, Any]) -> dict[str, Any]:
        """Subclass inference logic.

        Must return at minimum:
            {"report": str, "confidence": float, "signal": "bullish"|"bearish"|"neutral"}
        """
