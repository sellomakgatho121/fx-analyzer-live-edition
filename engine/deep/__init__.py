"""engine.deep - Multi-disciplinary deep learning pipeline for trading agents.

Integrates techniques from awesome-deep-trading into the Fx-analyzer engine:

  - deep/data/   → Multi-modal data feeds (Alpha Vantage, Quandl, feature store)
  - deep/models/ → LSTM (time-series), CNN (chart pattern), RL policy nets
  - deep/sentiment/ → NLP sentiment from social media + financial disclosures

Each subpackage exposes a standardised interface so the AgentAnalysisBridge
can consume their outputs alongside the TradingAgents LLM pipeline.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)
