"""
Agent Analysis Bridge - On-demand TradingAgents-MCPmode + Deep Agent integration

Wraps the TradingAgents WorkflowOrchestrator alongside the deep-learning
agents (LSTM, CNN, Sentiment) so the Fx-analyzer ZeroMQ bridge can trigger
a combined multi-agent analysis on-demand.

Usage (from bridge.py):
    self.agent_bridge = AgentAnalysisBridge()
    await self.agent_bridge.initialize()
    result = await self.agent_bridge.analyze("Analyze Apple stock")
"""

import io
import os
import sys
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class AgentAnalysisBridge:
    """Bridge for on-demand TradingAgents-MCPmode + Deep Agent analysis.

    Orchestrates two pipelines in parallel:
      1. TradingAgents (LLM multi-agent debate via WorkflowOrchestrator)
      2. Deep agents (LSTM, CNN, Sentiment) with data from MultiModalDataPipeline

    Results are merged into a single dict so the caller (bridge.py) has a
    unified view.
    """

    def __init__(self):
        self.orchestrator = None
        self.initialized = False
        self._deep_agents: list = []
        self._data_pipeline = None

    async def initialize(self) -> bool:
        """Initialize TradingAgents orchestrator + deep agents + data pipeline."""
        try:
            # --- Data pipeline (always available) ---
            from engine.deep.data.pipeline import MultiModalDataPipeline
            self._data_pipeline = MultiModalDataPipeline()

            # --- Deep agents (lazy-load; each trains on first call) ---
            deep_agents = await self._init_deep_agents()
            self._deep_agents = deep_agents

            # --- TradingAgents orchestrator (optional deps) ---
            config_dir = os.path.join(os.path.dirname(__file__), "trading_agents")
            config_file = os.path.join(config_dir, "mcp_config.json")

            # Fix Windows charmap encoding error: TradingAgents uses
            # print() with emoji/Chinese chars (🚀, 🏢, etc.) which crash
            # on cp1252 consoles. Force UTF-8 for stdout/stderr.
            if sys.platform == "win32":
                os.environ.setdefault("PYTHONIOENCODING", "utf-8")
                try:
                    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
                except (AttributeError, ValueError):
                    pass
                try:
                    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
                except (AttributeError, ValueError):
                    pass

            try:
                from engine.trading_agents.workflow_orchestrator import (
                    WorkflowOrchestrator,
                )

                cfg = config_file if os.path.exists(config_file) else None
                self.orchestrator = WorkflowOrchestrator(cfg or "{}")
                success = await self.orchestrator.initialize()
                if not success:
                    logger.warning("TradingAgents orchestrator init returned False")
            except ImportError as e:
                logger.warning("TradingAgents dependencies not installed: %s", e)
                self.orchestrator = None
            except Exception as e:
                logger.error("TradingAgents init failed: %s", e)
                self.orchestrator = None

            self.initialized = True
            logger.info(
                "AgentAnalysisBridge initialised (deep=%d, trading_agents=%s)",
                len(self._deep_agents),
                self.orchestrator is not None,
            )
            return True

        except Exception as e:
            logger.error("AgentAnalysisBridge init failed: %s", e)
            self.initialized = False
            return False

    async def _init_deep_agents(self) -> list:
        """Instantiate all available deep agents.

        Each agent follows the DeepAgent interface:
            await agent.load() -> bool
            await agent.analyze(symbol, context) -> dict

        Returns a list of loaded agents (or empty list if all fail).
        """
        loaded: list = []

        agent_classes = []

        # LSTM
        try:
            from engine.deep.models.lstm_agent import LSTMTradingAgent
            agent_classes.append(LSTMTradingAgent)
        except ImportError as e:
            logger.debug("LSTMTradingAgent not available: %s", e)

        # CNN
        try:
            from engine.deep.models.cnn_agent import CNNPatternAgent
            agent_classes.append(CNNPatternAgent)
        except ImportError as e:
            logger.debug("CNNPatternAgent not available: %s", e)

        # Sentiment
        try:
            from engine.deep.sentiment.analyzer import SentimentAnalyzer
            agent_classes.append(SentimentAnalyzer)
        except ImportError as e:
            logger.debug("SentimentAnalyzer not available: %s", e)

        for Cls in agent_classes:
            try:
                agent = Cls()
                ok = await agent.load()
                if ok:
                    loaded.append(agent)
                    logger.info("  Deep agent loaded: %s", agent.name)
                else:
                    logger.warning("  Deep agent load returned False: %s", agent.name)
            except Exception as e:
                logger.warning("  Deep agent init failed: %s", e)

        return loaded

    # ------------------------------------------------------------------
    # Public analysis API
    # ------------------------------------------------------------------

    async def analyze(
        self,
        query: str,
        active_agents: Optional[List[str]] = None,
        debate_rounds: Optional[int] = None,
        risk_rounds: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Run full multi-agent analysis pipeline and return serialisable result.

        Steps:
          1. Extract symbol from query (heuristic).
          2. Run TradingAgents LLM pipeline (if available).
          3. Run deep agents (LSTM, CNN, Sentiment) in parallel.
          4. Merge results into a single dict.
        """
        symbol = self._extract_symbol(query)

        # --- Run both pipelines concurrently ---
        trading_task = asyncio.create_task(
            self._run_trading_agents(query, active_agents, debate_rounds, risk_rounds)
        )
        deep_task = asyncio.create_task(
            self._run_deep_agents(symbol, query)
        )

        trading_result, deep_result = await asyncio.gather(
            trading_task, deep_task, return_exceptions=True
        )

        if isinstance(trading_result, Exception):
            logger.error("TradingAgents pipeline error: %s", trading_result)
            trading_result = {"status": "error", "error": str(trading_result)}

        if isinstance(deep_result, Exception):
            logger.error("Deep agents pipeline error: %s", deep_result)
            deep_result = {"status": "error", "error": str(deep_result)}

        # --- Merge ---
        merged = dict(trading_result) if isinstance(trading_result, dict) else {}
        if isinstance(deep_result, dict):
            merged["deep_analysis"] = deep_result

        return merged

    async def _run_trading_agents(
        self,
        query: str,
        active_agents: Optional[List[str]] = None,
        debate_rounds: Optional[int] = None,
        risk_rounds: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Run TradingAgents-MCPmode LLM pipeline."""
        if not self.orchestrator:
            return {
                "status": "unavailable",
                "note": "TradingAgents pipeline not initialised",
            }

        try:
            if debate_rounds is not None or risk_rounds is not None:
                self.orchestrator.set_debate_rounds(debate_rounds, risk_rounds)

            result = await self.orchestrator.run_analysis(
                query, active_agents=active_agents
            )
            return self._state_to_dict(result)
        except Exception as e:
            logger.error("TradingAgents analysis failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def _run_deep_agents(self, symbol: str, query: str) -> Dict[str, Any]:
        """Run all loaded deep agents + data pipeline in parallel.

        Returns a dict keyed by agent name, plus a ``_market_data`` entry
        with OHLCV summary and alternative data.
        """
        if not self._deep_agents:
            return self._neutral_deep("unavailable", "No deep agents loaded")

        if not symbol:
            return self._neutral_deep(
                "skipped", "No symbol could be extracted from query"
            )

        # Fetch market + alternative data first
        market_data = None
        alt_data = None
        if self._data_pipeline:
            try:
                market_data = await self._data_pipeline.fetch_market_data(symbol, days=365)
                alt_data = await self._data_pipeline.fetch_alternative_data(symbol)
            except Exception as e:
                logger.warning("Data pipeline fetch failed: %s", e)

        # Run all deep agents concurrently
        async def _run_one(agent) -> tuple[str, Dict[str, Any]]:
            try:
                result = await agent.analyze(symbol, {"query": query})
                return agent.name, result
            except Exception as e:
                logger.error("%s.analyze(%s) failed: %s", agent.name, symbol, e)
                return agent.name, {"error": str(e), "confidence": 0.0, "signal": "neutral"}

        tasks = [_run_one(a) for a in self._deep_agents]
        agent_results = await asyncio.gather(*tasks)

        deep: Dict[str, Any] = {"status": "ok"}
        # Canonical keys consumed by the frontend normaliseDeepAnalysis
        # contract (frontend/src/lib/socketEventBus.js).  Raw agent results
        # are kept alongside under their agent names.
        canonical = {"lstm": None, "cnn": None, "sentiment": None}
        for name, result in agent_results:
            deep[name] = result
            if name == "lstm_trading_agent":
                canonical["lstm"] = {
                    "signal": result.get("signal", "neutral"),
                    "direction": result.get("signal", "neutral"),
                    "confidence": result.get("confidence", 0.0),
                    "price_target": result.get("price_target"),
                    "feature_importance": self._features_to_list(
                        result.get("features")
                    ),
                    "model_version": "LSTM-v1",
                }
            elif name == "cnn_pattern_agent":
                pattern = result.get("pattern")
                canonical["cnn"] = {
                    "pattern": pattern,
                    "confidence": result.get("confidence", 0.0),
                    "pattern_type": pattern,
                    "pattern_probabilities": self._rule_patterns_to_dict(
                        result.get("rule_patterns")
                    ),
                }
            elif name == "sentiment_analyzer":
                canonical["sentiment"] = {
                    "signal": result.get("signal", "neutral"),
                    "confidence": result.get("confidence", 0.0),
                    "sentiment_score": result.get("sentiment_score", 0.0),
                    "headline_count": result.get("headline_count", 0),
                    "positive_ratio": result.get("positive_ratio", 0.5),
                    "top_headlines": result.get("top_headlines", []),
                }

        for key, value in canonical.items():
            if value is not None:
                deep[key] = value

        # Attach data snapshots (non-blocking summary)
        if market_data is not None and hasattr(market_data, "iloc") and not market_data.empty:
            try:
                last = market_data.iloc[-1]
                deep["_market_snapshot"] = {
                    "close": float(last.get("Close", 0)),
                    "volume": int(last.get("Volume", 0)),
                    "high": float(last.get("High", 0)),
                    "low": float(last.get("Low", 0)),
                    "open": float(last.get("Open", 0)),
                }
            except Exception:
                pass

        if alt_data:
            deep["_alternative_data"] = alt_data

        return deep

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_symbol(query: str) -> str:
        """Extract a tradable symbol from a query string.

        Handles FX pairs (EURUSD, EUR/USD, "eur usd"), indices (US30,
        US500), crypto (BTCUSD) and stock tickers (AAPL, TSLA).  Matching
        is case-insensitive and whitelist-based so stopwords never match.
        """
        import re

        # Whitelist of symbols this app actually trades/analyses.
        KNOWN = {
            # FX majors + crosses
            "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF",
            "NZDUSD", "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "EURCHF",
            "GBPAUD", "EURAUD", "EURCAD", "CADJPY", "CHFJPY", "NZDJPY",
            "AUDNZD", "EURNZD", "GBPNZD", "GBPCAD", "AUDCAD", "AUDCHF",
            # Crypto + metals
            "BTCUSD", "ETHUSD", "XAUUSD", "XAGUSD",
            # Indices
            "US30", "US500", "US100", "NAS100", "SPX500", "GER30", "UK100",
            # Stocks
            "AAPL", "TSLA", "NVDA", "MSFT", "GOOG", "AMZN", "META", "NFLX",
        }
        text = query.upper()

        # 1. Slashed pair: "EUR/USD" -> EURUSD
        m = re.search(r"\b([A-Z]{3})\s*/\s*([A-Z]{3})\b", text)
        if m:
            return m.group(1) + m.group(2)

        # 2. Adjacent 3-letter tokens: "analyze EUR USD" -> EURUSD
        m = re.search(r"\b([A-Z]{3})\s+([A-Z]{3})\b", text)
        if m and (m.group(1) + m.group(2)) in KNOWN:
            return m.group(1) + m.group(2)

        # 3. Plain known token: "US30", "AAPL", "us30", ...
        for token in re.split(r"[^A-Z0-9]+", text):
            if token in KNOWN:
                return token

        return ""

    @staticmethod
    def _features_to_list(features) -> list:
        """Normalise LSTM feature attribution into a renderable list."""
        if isinstance(features, dict):
            return [
                {"name": name, "importance": round(float(value), 4)}
                for name, value in features.items()
            ]
        return features or []

    @staticmethod
    def _rule_patterns_to_dict(rule_patterns) -> dict:
        """Normalise CNN rule-based patterns into a probability dict."""
        if isinstance(rule_patterns, list):
            return {
                rp.get("name", "pattern"): rp.get("confidence", 0.0)
                for rp in rule_patterns
                if isinstance(rp, dict)
            }
        return {}

    @staticmethod
    def _neutral_deep(status: str, note: str) -> dict:
        """Deep-analysis bundle with explicit neutral defaults so the
        frontend never silently falls back to placeholder values."""
        return {
            "status": status,
            "note": note,
            "lstm": {
                "signal": "neutral",
                "direction": "neutral",
                "confidence": 0.0,
                "price_target": None,
                "feature_importance": [],
                "model_version": "LSTM-v1",
            },
            "cnn": {
                "pattern": None,
                "confidence": 0.0,
                "pattern_type": None,
                "pattern_probabilities": {},
            },
        }

    def _state_to_dict(self, state) -> Dict[str, Any]:
        """Convert AgentState (LangGraph dict or object) to JSON-safe dict."""
        get_field = (
            (lambda k, d="": state.get(k, d))
            if isinstance(state, dict)
            else (lambda k, d="": getattr(state, k, d))
        )

        return {
            "status": "ok",
            "language_graph_state": {
                "phase": self._derive_phase(get_field),
                "user_query": get_field("user_query"),
                "investment_debate_state": get_field("investment_debate_state", {}),
                "risk_debate_state": get_field("risk_debate_state", {}),
            },
            "user_query": get_field("user_query"),
            "company_overview_report": get_field("company_overview_report"),
            "market_report": get_field("market_report"),
            "sentiment_report": get_field("sentiment_report"),
            "news_report": get_field("news_report"),
            "fundamentals_report": get_field("fundamentals_report"),
            "shareholder_report": get_field("shareholder_report"),
            "product_report": get_field("product_report"),
            "investment_plan": get_field("investment_plan"),
            "trader_investment_plan": get_field("trader_investment_plan"),
            "final_trade_decision": get_field("final_trade_decision"),
            "investment_debate_state": get_field("investment_debate_state", {}),
            "risk_debate_state": get_field("risk_debate_state", {}),
            "agent_execution_history": get_field("agent_execution_history", []),
            "mcp_tool_calls": get_field("mcp_tool_calls", []),
            "errors": get_field("errors", []),
            "warnings": get_field("warnings", []),
        }

    @staticmethod
    def _derive_phase(get_field) -> int:
        """Map workflow progress onto the frontend phase index.

        0 idle, 1 company_overview, 2 parallel_analysis,
        3 bull_bear_debate, 4 research_manager, 5 trader_decision,
        6 risk_debate, 7 consensus.
        """
        if get_field("final_trade_decision"):
            return 7
        risk = get_field("risk_debate_state", {})
        if isinstance(risk, dict) and risk.get("count", 0) > 0:
            return 6
        if get_field("trader_investment_plan"):
            return 5
        if get_field("investment_plan"):
            return 4
        invest = get_field("investment_debate_state", {})
        if isinstance(invest, dict) and invest.get("count", 0) > 0:
            return 3
        if get_field("market_report") or get_field("sentiment_report"):
            return 2
        if get_field("company_overview_report"):
            return 1
        return 0

    async def close(self):
        """Clean up orchestrator and deep agent resources."""
        # TradingAgents
        if self.orchestrator:
            try:
                await self.orchestrator.close()
            except Exception as e:
                logger.warning("Error closing orchestrator: %s", e)

        # Deep agents
        for agent in self._deep_agents:
            try:
                if hasattr(agent, "close"):
                    await agent.close()
            except Exception as e:
                logger.warning("Error closing %s: %s", agent.name, e)

        # Data pipeline
        if self._data_pipeline:
            try:
                await self._data_pipeline.close()
            except Exception as e:
                logger.warning("Error closing data pipeline: %s", e)

        self.initialized = False
