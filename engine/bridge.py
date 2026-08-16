import asyncio
import os
import sys
from pathlib import Path
import zmq
import zmq.asyncio
import json
import logging
import time
from datetime import datetime
import pandas as pd

# ``python engine/bridge.py`` puts ``engine/`` (not the repo root) on
# sys.path, so ``import engine`` fails unless the repo root is prepended.
# Adding it here makes ``engine.*`` imports resolve regardless of how the
# engine is launched (``python -m engine.bridge`` from root works too).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load ./.env if present (Render mounts it as a Secret File; on the phone the
# launcher may export these instead). Real env vars are never overridden.
from dotenv import load_dotenv
load_dotenv()
# Render mounts API-created Secret Files at /etc/secrets/ (dashboard-created
# ones can mount anywhere, e.g. /app/.env). load_dotenv with an explicit path
# is a silent no-op if the file is absent.
load_dotenv("/app/.env")
load_dotenv("/etc/secrets/.env")

from engine.analyzer import TechnicalAnalyzer
from engine.broker import get_broker
from engine.orchestrator import MoEOrchestrator
from engine.data_feed import DataFeed
from engine.calendar_service import CalendarService
from engine import database
from engine.vibe_research_service import VibeResearchService
from engine.agent_bridge import AgentAnalysisBridge

# Setup Logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

# Constants (ports overridable via env for constrained environments)
ZMQ_PORT = int(os.environ.get("ZMQ_PORT", 5555))
ZMQ_CMD_PORT = int(os.environ.get("ZMQ_CMD_PORT", 5556))
# Candle fetches are slow (network data feeds, rate-limited), and the REP
# command loop is strictly sequential — a single slow GET_CANDLES would stall
# every other command (MT5_STATUS, EXECUTE_TRADE) for up to 25s. Cache recent
# responses so repeated chart polls never touch the network again.
CANDLE_CACHE_TTL = int(os.environ.get("CANDLE_CACHE_TTL", 90))
SYMBOLS = [
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "AUDUSD",
    "BTCUSD",
    "ETHUSD",
    "US30",
    "US500",
    "AAPL",
    "TSLA",
]


def normalize_symbol(symbol: str) -> str:
    """Normalize a requested instrument to engine form (EUR/USD -> EURUSD)."""
    return str(symbol or "").strip().upper().replace("/", "")


def frame_message(topic: str, payload: dict) -> str:
    """ZeroMQ PUB framing: '<topic> <json>' — the engine↔backend contract."""
    return f"{topic} {json.dumps(payload)}"


class AsyncEngineBridge:
    def __init__(self):
        self.context = zmq.asyncio.Context()
        self.socket = self.context.socket(zmq.PUB)
        self.socket.bind(f"tcp://*:{ZMQ_PORT}")
        logging.info(f"ZeroMQ Publisher bound to port {ZMQ_PORT}")

        self.analyzer = TechnicalAnalyzer()
        self.broker = get_broker(symbols=SYMBOLS)
        self.broker.tick_cb = self._on_broker_tick
        self.broker.position_change_cb = self._on_broker_positions_change
        self.moe = MoEOrchestrator()  # Replaces LLMAnalyzer
        self.data_feed = DataFeed()
        self.data_feed.set_broker(self.broker)
        self._candle_cache: dict = {}  # symbol -> (monotonic_ts, limit, response)
        self.calendar = CalendarService()
        self.vibe_research = VibeResearchService(pub_socket=self.socket)
        self.agent_bridge = AgentAnalysisBridge()

        # Initialize Database
        database.init_db()

        # Expose live subsystem state to the HTTP /health endpoint
        # (best-effort; the bridge may not be running).
        try:
            from engine.http_bridge import register_status_provider
            register_status_provider(self.status_snapshot)
        except Exception as e:
            logging.warning(f"HTTP bridge status provider registration failed: {e}")

        # Command Socket (REP)
        self.cmd_socket = self.context.socket(zmq.REP)
        self.cmd_socket.bind(f"tcp://*:{ZMQ_CMD_PORT}")

    async def listen_commands(self):
        """
        Listens for commands from Node.js interface async.
        """
        logging.info(f"Command Socket (REP) listening on {ZMQ_CMD_PORT}")
        while True:
            try:
                msg = await self.cmd_socket.recv_json()
                cmd = msg.get("cmd")

                response = {"status": "error", "message": "Unknown command"}

                if cmd == "SET_LLM_MODEL":
                    model = msg.get("model")
                    if model:
                        result = self.moe.set_global_model(model)
                        if result["success"]:
                            response = {"status": "ok", "message": result["message"]}
                        else:
                            response = {
                                "status": "error",
                                "message": "Failed to update some agents",
                            }
                    else:
                        response = {"status": "error", "message": "No model specified"}

                elif cmd == "GET_MODELS":
                    # Return all models whose API keys are configured
                    try:
                        from engine.agents.base import BaseAgent
                    except ImportError:
                        from agents.base import BaseAgent
                    configured = BaseAgent.get_configured_models()
                    response = {
                        "status": "ok",
                        "models": configured,
                        "models_list": list(configured.values()),
                    }

                elif cmd == "EXECUTE_TRADE":
                    sys_symbol = msg.get("symbol")
                    sys_action = str(msg.get("action", "")).upper()
                    sys_volume = msg.get("volume", 0.01)
                    sys_sl = msg.get("sl")
                    sys_tp = msg.get("tp")

                    if sys_symbol and sys_action:
                        logging.info(
                            f"Executing broker trade: {sys_symbol} {sys_action} "
                            f"(provider={self.broker.name})"
                        )
                        try:
                            exec_res = await self.broker.execute_market_order(
                                sys_symbol,
                                sys_action,
                                volume_lots=sys_volume,
                                sl=sys_sl,
                                tp=sys_tp,
                                comment="FX Analyzer Pro",
                            )
                        except Exception as e:
                            logging.error(f"Broker execution failed: {e}")
                            exec_res = {"status": "failed", "reason": str(e)}
                        if exec_res["status"] in ["filled", "mock_filled"]:
                            response = {
                                "status": "filled",
                                "ticket": exec_res.get("ticket", 0),
                                "position_id": exec_res.get("position_id"),
                                # Real fill price from the broker execution
                                # event (never the client's requested price).
                                "price": exec_res.get("price"),
                            }
                        else:
                            response = {
                                "status": "error",
                                "message": exec_res.get("reason", "Execution Failed"),
                            }
                    else:
                        response = {"status": "error", "message": "Missing symbol or action"}

                elif cmd == "CLOSE_TRADE":
                    pos_id = msg.get("position_id") or msg.get("positionId")
                    vol = msg.get("volume")
                    if not pos_id:
                        # Fall back to closing by symbol (first matching position).
                        sym = msg.get("symbol")
                        if sym:
                            try:
                                positions = await self.broker.get_positions()
                            except Exception as e:
                                logging.error(f"Broker positions query failed: {e}")
                                positions = []
                            match = next(
                                (p for p in positions
                                 if str(p.get("symbol", "")).upper() == sym.upper()),
                                None,
                            )
                            if match:
                                pos_id = match.get("position_id") or match.get("id")
                    if not pos_id:
                        response = {"status": "error",
                                    "message": "No matching open position"}
                    else:
                        try:
                            close_res = await self.broker.close_position(
                                pos_id, volume_lots=vol
                            )
                        except Exception as e:
                            logging.error(f"Broker close failed: {e}")
                            close_res = {"status": "failed", "reason": str(e)}
                        if close_res.get("status") in ("closed", "mock_closed"):
                            response = {
                                "status": "closed",
                                "position_id": close_res.get("position_id", pos_id),
                                "ticket": close_res.get("ticket"),
                                # Real close fill price so the bot can record
                                # an accurate exit price and P/L.
                                "price": close_res.get("price"),
                            }
                        else:
                            response = {
                                "status": "error",
                                "message": close_res.get("reason", "Close Failed"),
                            }

                elif cmd == "AMEND_TRADE":
                    pos_id = msg.get("position_id") or msg.get("positionId")
                    if not pos_id:
                        sym = msg.get("symbol")
                        if sym:
                            try:
                                positions = await self.broker.get_positions()
                            except Exception as e:
                                logging.error(f"Broker positions query failed: {e}")
                                positions = []
                            match = next(
                                (p for p in positions
                                 if str(p.get("symbol", "")).upper() == sym.upper()),
                                None,
                            )
                            if match:
                                pos_id = match.get("position_id") or match.get("id")
                    if not pos_id:
                        response = {"status": "error",
                                    "message": "No matching open position"}
                    else:
                        sl = msg.get("sl")
                        tp = msg.get("tp")
                        try:
                            amend_res = await self.broker.amend_position_sltp(
                                pos_id, stop_loss=sl, take_profit=tp
                            )
                        except Exception as e:
                            logging.error(f"Broker amend failed: {e}")
                            amend_res = {"status": "failed", "reason": str(e)}
                        if amend_res.get("status") == "amended":
                            response = amend_res
                        else:
                            response = {
                                "status": "error",
                                "message": amend_res.get("reason", "Amend Failed"),
                            }

                elif cmd in ("MT5_STATUS", "BROKER_STATUS"):
                    try:
                        info = await self.broker.get_account_info()
                    except Exception as e:
                        logging.error(f"Broker status failed: {e}")
                        info = {
                            "connected": False,
                            "account": None,
                            "server": None,
                            # Fail closed: never fabricate a zero balance.
                            "balance": None,
                            "equity": None,
                        }
                    response = {"status": "ok", "info": info}

                elif cmd == "BROKER_POSITIONS":
                    try:
                        positions = await self.broker.get_positions()
                        response = {"status": "ok", "positions": positions}
                    except Exception as e:
                        logging.error(f"BROKER_POSITIONS failed: {e}")
                        response = {"status": "error", "message": str(e)}

                elif cmd == "BROKER_ORDERS":
                    try:
                        orders = await self.broker.get_pending_orders()
                        response = {"status": "ok", "orders": orders}
                    except Exception as e:
                        logging.error(f"BROKER_ORDERS failed: {e}")
                        response = {"status": "error", "message": str(e)}

                elif cmd == "GET_CANDLES":
                    symbol = normalize_symbol(msg.get("symbol", ""))
                    limit = min(int(msg.get("limit", 150)), 500)
                    if not symbol:
                        response = {"status": "error", "message": "No symbol provided"}
                    else:
                        cached = self._candle_cache.get(symbol)
                        if (
                            cached
                            and time.monotonic() - cached[0] < CANDLE_CACHE_TTL
                            and cached[1] >= limit
                        ):
                            response = dict(cached[2])
                            response["cached"] = True
                        else:
                            response = await self._fetch_candles(symbol, limit)
                            if response.get("status") == "ok":
                                self._candle_cache[symbol] = (
                                    time.monotonic(),
                                    limit,
                                    response,
                                )

                elif cmd == "ENGINE_AGENT_ANALYZE":
                    query = msg.get("query", "")
                    active_agents = msg.get("active_agents")
                    debate_rounds = msg.get("debate_rounds")
                    risk_rounds = msg.get("risk_rounds")

                    if not query:
                        response = {"status": "error", "message": "No query provided"}
                    else:
                        logging.info(f"Agent analysis requested: {query[:80]}")
                        result = await self.agent_bridge.analyze(
                            query,
                            active_agents=active_agents,
                            debate_rounds=debate_rounds,
                            risk_rounds=risk_rounds,
                        )
                        # Attach MoE consensus so the frontend agents panel
                        # gets real technical/fundamental/sentiment/risk data.
                        if isinstance(result, dict):
                            try:
                                symbol = AgentAnalysisBridge._extract_symbol(query)
                                if symbol:
                                    consensus = await self._attach_moe_consensus(symbol)
                                    if consensus:
                                        result["moeConsensus"] = consensus
                            except Exception as e:
                                logging.warning(f"MoE consensus attach failed: {e}")
                        response = result

                elif cmd == "AGENT_BRIDGE_STATUS":
                    response = {
                        "status": "ok",
                        "initialized": self.agent_bridge.initialized,
                    }

                await self.cmd_socket.send_json(response)

            except asyncio.CancelledError:
                if asyncio.current_task().cancelling():
                    raise  # genuine shutdown — exit cleanly
                # A broker future was cancelled mid-command (transport
                # reconnecting); answer the caller instead of dying.
                logging.warning("Broker future cancelled mid-command")
                try:
                    await self.cmd_socket.send_json(
                        {"status": "error",
                         "message": "broker reconnecting; try again"})
                except Exception:
                    pass
            except Exception as e:
                logging.error(f"Command Error: {e}")
                try:
                    await self.cmd_socket.send_json(
                        {"status": "error", "message": str(e)})
                except Exception:
                    pass

    async def _fetch_candles(self, symbol: str, limit: int) -> dict:
        """Fetch candles for one symbol (cTrader only; fails closed)."""
        try:
            df = await asyncio.wait_for(
                self.data_feed.fetch_data_async(symbol, limit=limit),
                timeout=25,
            )
        except asyncio.TimeoutError:
            logging.error(f"GET_CANDLES timed out for {symbol}")
            return {"status": "error", "message": f"candles timeout for {symbol}"}
        except Exception as e:
            logging.error(f"GET_CANDLES failed for {symbol}: {e}")
            return {"status": "error", "message": str(e)}
        if df is None or len(df) < 2:
            # Fail closed: never fabricate bars. The frontend degrades.
            logging.warning(f"GET_CANDLES: no cTrader bars for {symbol}")
            return {
                "status": "error",
                "message": f"no live candles for {symbol} (cTrader unavailable)",
            }
        df = df.tail(limit).reset_index(drop=True)
        candles = []
        for _, row in df.iterrows():
            try:
                ts = row["time"]
                ts = int(
                    ts.timestamp()
                    if hasattr(ts, "timestamp")
                    else pd.Timestamp(ts).timestamp()
                )
            except Exception:
                ts = int(time.time())
            candles.append(
                {
                    "time": ts,
                    "open": round(float(row["open"]), 5),
                    "high": round(float(row["high"]), 5),
                    "low": round(float(row["low"]), 5),
                    "close": round(float(row["close"]), 5),
                    "volume": float(row.get("tick_volume", 0) or 0),
                }
            )
        return {
            "status": "ok",
            "symbol": symbol,
            "source": "ctrader",
            "mock": False,
            "count": len(candles),
            "candles": candles,
        }

    async def _attach_moe_consensus(self, symbol: str) -> dict:
        """Run MoE consensus and reshape into the frontend agents contract."""
        try:
            df = await asyncio.wait_for(
                self.data_feed.fetch_data_async(symbol), timeout=20
            )
        except Exception:
            df = None
        if df is None or len(df) < 2:
            return {}

        moe_result = await asyncio.wait_for(
            self.moe.get_consensus_signal(symbol, df), timeout=30
        )
        if not isinstance(moe_result, dict):
            return {}

        breakdown = moe_result.get("agent_breakdown", {}) or {}
        return {
            "technical": breakdown.get("technical")
            or {"signal": "neutral", "confidence": 0},
            "fundamental": breakdown.get("fundamental")
            or {"signal": "neutral", "confidence": 0},
            "sentiment": breakdown.get("sentiment")
            or {"signal": "neutral", "confidence": 0},
            "risk": breakdown.get("risk")
            or {"signal": "neutral", "confidence": 0},
            "aggregate": {
                "signal": moe_result.get("action", "HOLD"),
                "confidence": moe_result.get("confidence", 0.0),
                "verdict": moe_result.get("action", "HOLD"),
                "reasoning": moe_result.get("reasoning", ""),
            },
        }

    def status_snapshot(self) -> dict:
        """Live subsystem state for the HTTP bridge /health endpoint.

        Returns broker/datafeed state only; llm/calendar/rag are derived
        inside http_bridge itself. Must never raise.
        """
        broker = "unknown"
        try:
            if getattr(self.broker, "name", "") == "mock":
                broker = "connected"  # paper trading is always connected
            elif getattr(self.broker, "_connected", False):
                broker = "connected"
            else:
                broker = "reconnecting"
            if getattr(self.broker, "_auth_failed", False):
                broker = "reconnecting"
        except Exception as e:
            logging.warning(f"Broker state introspection failed: {e}")
        src = getattr(self.data_feed, "last_source", "unknown")
        datafeed = {"ctrader": "live"}.get(src, "unavailable")
        # Logical symbols the live account does not list (neither exact name
        # nor any known alias) — surfaced so the operator can see coverage.
        unmapped = sorted(getattr(self.broker, "unmapped_symbols", None) or [])
        return {
            "broker": broker,
            "datafeed": datafeed,
            "unmapped_symbols": unmapped,
        }

    async def _on_broker_tick(self, tick: dict) -> None:
        """Publish a real-time broker quote on the engine PUB socket."""
        try:
            # Only live adapters (cTrader) emit ticks; the mock broker never
            # fires tick_cb, so this is False in practice. Kept defensive so
            # a synthetic broker tick can never masquerade as a live price.
            mock = getattr(self.broker, "name", "") == "mock"
            frame = {
                "symbol": tick.get("symbol"),
                "price": tick.get("bid", 0.0),
                "bid": tick.get("bid"),
                "ask": tick.get("ask"),
                "timestamp": datetime.fromtimestamp(
                    tick.get("timestamp", time.time())
                ).isoformat(),
                "mock": mock,
            }
            await self.socket.send_string(frame_message("ticker", frame))
        except Exception as e:
            logging.warning(f"Broker tick publish failed: {e}")

    async def _on_broker_positions_change(self, positions: list) -> None:
        """Publish an up-to-date positions snapshot (backend syncs to UI)."""
        try:
            await self.socket.send_string(
                frame_message("positions", {"positions": positions})
            )
        except Exception as e:
            logging.warning(f"Positions publish failed: {e}")

    async def _maybe_auto_execute(self, signal: dict) -> dict:
        """Guarded agent execution for MoE signals (off by default).

        Enabled with ``AUTO_EXECUTE_SIGNALS=1``; capped by
        ``MAX_OPEN_POSITIONS`` (default 3) and sized with
        ``AUTO_TRADE_VOLUME`` (default 0.01 lot).  Returns the execution
        outcome so the signal record can carry it.
        """
        if os.environ.get("AUTO_EXECUTE_SIGNALS", "0") != "1":
            return {"status": "disabled"}
        action = str(signal.get("action", "HOLD")).upper()
        if action not in ("BUY", "SELL"):
            return {"status": "skipped", "reason": f"action {action} not executable"}
        max_positions = int(os.environ.get("MAX_OPEN_POSITIONS", "3"))
        try:
            positions = await self.broker.get_positions()
        except Exception as e:
            logging.error(f"Auto-execution positions check failed: {e}")
            return {"status": "blocked", "reason": f"positions check failed: {e}"}
        if len(positions) >= max_positions:
            return {
                "status": "blocked",
                "reason": f"max open positions reached ({max_positions})",
            }
        try:
            return await self.broker.execute_market_order(
                symbol=signal.get("symbol", ""),
                action=action,
                volume_lots=float(os.environ.get("AUTO_TRADE_VOLUME", "0.01")),
                comment=f"MoE {action} signal",
            )
        except Exception as e:
            logging.error(f"Auto-execution failed: {e}")
            return {"status": "failed", "reason": str(e)}

    async def generate_daily_briefing(self):
        """
        Generates a pre-day analysis briefing.
        """
        logging.info("Generating Daily Briefing...")
        briefing_data = self.calendar.get_todays_events()

        scan_results = []
        for symbol in SYMBOLS[:5]:
            df = await self.data_feed.fetch_data_async(symbol)
            if df is None or df.empty:
                logging.warning(
                    f"Daily briefing: no cTrader data for {symbol} — skipping"
                )
                continue
            analysis = self.analyzer.analyze_daily(df)
            if analysis:
                scan_results.append(
                    {
                        "symbol": symbol,
                        "trend": analysis["trend"],
                        "price": analysis["price"],
                    }
                )

        briefing = {
            "type": "DAILY_BRIEFING",
            "date": briefing_data["date"],
            "events": briefing_data["events"],
            "market_scan": scan_results,
        }

        await self.socket.send_string(frame_message("notification", briefing))
        logging.info("Daily Briefing Sent")

    async def run_loop(self):
        logging.info("Engine Bridge Running...")

        # Initial Briefing
        await asyncio.sleep(2)
        await self.generate_daily_briefing()

        try:
            while True:
                for symbol in SYMBOLS:
                    # 1. Fetch (run in a thread with a hard timeout so a hung
                    #    network call can't freeze the whole engine loop).
                    try:
                        df = await asyncio.wait_for(
                            self.data_feed.fetch_data_async(symbol),
                            timeout=25,
                        )
                    except (asyncio.TimeoutError, Exception) as e:
                        logging.warning(
                            f"DataFeed timed out for {symbol} ({e}) — skipping"
                        )
                        df = None
                    if df is None or df.empty:
                        # Fail closed: no cTrader bars -> no analysis, no
                        # ticker, no signal for this symbol this cycle.
                        logging.warning(
                            f"DataFeed: no live cTrader bars for {symbol} — skipping scan"
                        )
                        continue

                    # 2. Analyze Technicals (Fast check first)
                    analyzed_df = self.analyzer.analyze(df)
                    signal = self.analyzer.check_signals(analyzed_df, symbol)

                    # 3. If Signal -> Engage MoE
                    if signal:
                        logging.info(f"Signal Triggered: {symbol} {signal['action']}")

                        # Call MoE Consensus (Async)
                        # We pass 'df' which the TechnicalAgent will re-analyze,
                        # but we could optimize by passing pre-calced data.
                        # For now, following the test_moe pattern:
                        moe_result = await self.moe.get_consensus_signal(
                            symbol, analyzed_df
                        )

                        # Merge Results
                        signal["ai_reasoning"] = moe_result.get("reasoning")
                        signal["agent_breakdown"] = moe_result.get(
                            "agent_breakdown", {}
                        )
                        signal["risk_factors"] = (
                            f"Lev: {moe_result.get('risk_parameters', {}).get('leverage')}x"
                        )
                        signal["confidence"] = moe_result.get("confidence", 0.5)

                        # Re-evaluate Action based on Consensus
                        # If MoE says HOLD/NEUTRAL but Tech said BUY, we might kill the trade
                        # or just downgrade confidence.
                        if moe_result.get("action") == "HOLD":
                            logging.info(f"MoE vetoed {symbol} trade.")
                            continue  # Skip publishing

                        # Guarded agent execution (off unless AUTO_EXECUTE_SIGNALS=1)
                        signal["execution"] = await self._maybe_auto_execute(signal)

                        # Store & Publish
                        signal["id"] = int(time.time() * 1000)
                        signal["source"] = "MOE_ENGINE"
                        signal["data_source"] = self.data_feed.last_source

                        database.store_signal(signal)
                        logging.info(f"MoE Signal Published: {signal['id']}")

                        await self.socket.send_string(frame_message("signal", signal))

                # No scan-loop ticker here: live prices are published by the
                # broker spot feed (_on_broker_tick), which carries real
                # bid/ask. A candle-close price would be stale (up to 15 min)
                # and price-only, and must never masquerade as a live quote.

                await asyncio.sleep(2)

        except asyncio.CancelledError:
            logging.info("Loop cancelled")
        finally:
            self.data_feed.shutdown()
            self.broker.shutdown()

    async def main(self):
        # Start agent bridge initialisation in background (non-blocking)
        init_task = asyncio.create_task(self.agent_bridge.initialize())

        # Broker connection supervisor (mock is a no-op; cTrader reconnects)
        broker_task = asyncio.create_task(self.broker.run())

        # Run Command Listener, Main Loop and Vibe Research background tasks concurrently
        try:
            await asyncio.gather(
                self.listen_commands(),
                self.run_loop(),
                self.vibe_research.run_research_tasks(),
                init_task,
                broker_task,
            )
        finally:
            self.broker.shutdown()


if __name__ == "__main__":
    import sys
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # HTTP/SSE fallback transport for backends that cannot load the Node
    # zeromq addon (Termux/Android). Daemon thread; dies with this process.
    try:
        from engine.http_bridge import start_http_bridge
        start_http_bridge(pub_port=ZMQ_PORT, cmd_port=ZMQ_CMD_PORT)
    except Exception as e:
        logging.warning(f"HTTP bridge not started: {e}")

    bridge = AsyncEngineBridge()
    try:
        asyncio.run(bridge.main())
    except KeyboardInterrupt:
        logging.info("Shutting down...")
