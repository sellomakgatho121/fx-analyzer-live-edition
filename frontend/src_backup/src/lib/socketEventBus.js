/**
 * socketEventBus — Socket.IO event manager.
 * Connects to the backend bridge (Express + Socket.IO on :4000), forwards
 * backend events to Zustand stores and exposes emit helpers for commands.
 *
 * The backend protocol (backend/server.js) uses these events:
 *   server -> client: ticker-update, fx-signal, signal-history,
 *                     trade-executed, trade-rejected, risk-stats-update,
 *                     risk-settings-updated, llm-models-list, model-changed,
 *                     notification, mt5-status, broker-status,
 *                     vibe-research-update, analysis:result
 *   client -> server: execute-trade, update-risk-settings, get-llm-models,
 *                     switch-llm-model, mt5-get-status, mt5-reconnect,
 *                     agent:analyze
 */
import { io } from 'socket.io-client';
import useSessionStore from '@/store/sessionStore';
import useAgentStore from '@/store/agentStore';
import useTradingStore from '@/store/tradingStore';
import useAnalysisStore from '@/store/analysisStore';

// Same-origin: the engine bridge (backend) is served from the same URL as
// this frontend, so the Socket.IO client connects to window.location.origin.
const DEFAULT_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

let socket = null;
let reconnectTimer = null;

// ── Tiny local emitter (bus-level on/off/emit) ────────────────────────
const listeners = {};

function on(event, handler) {
  if (typeof handler !== 'function') return () => {};
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(handler);
  return () => off(event, handler);
}

function off(event, handler) {
  if (!handler) {
    delete listeners[event];
    return;
  }
  listeners[event]?.delete(handler);
}

function emitLocal(event, data) {
  listeners[event]?.forEach((handler) => {
    try {
      handler(data);
    } catch (err) {
      console.error(`[socketEventBus] listener error for "${event}":`, err);
    }
  });
}

/**
 * Normalise deep-analysis bundle from the MoE orchestrator.
 * The engine sends a combined payload after running all agents in parallel.
 */
function normaliseDeepAnalysis(payload) {
  const dl = payload.deep_analysis || payload.deepLearning || {};
  const llm = payload.llm_analysis || payload.moeConsensus || payload;
  return {
    lstm: {
      signal: dl.lstm?.prediction || dl.lstm?.direction || 'neutral',
      direction: dl.lstm?.direction || dl.lstm?.prediction || 'neutral',
      confidence: dl.lstm?.confidence ?? 0.5,
      price_target: dl.lstm?.price_target || dl.lstm?.targetPrice || null,
      feature_importance: dl.lstm?.feature_importance || [],
      model_version: dl.lstm?.model_version || 'LSTM-v1',
    },
    cnn: {
      pattern: dl.cnn?.pattern || null,
      confidence: dl.cnn?.confidence ?? 0,
      pattern_type: dl.cnn?.pattern_type || dl.cnn?.type || null,
      pattern_probabilities: dl.cnn?.pattern_probabilities || {},
    },
    agents: {
      technical: llm.technical || { signal: 'neutral', confidence: 0 },
      fundamental: llm.fundamental || { signal: 'neutral', confidence: 0 },
      sentiment: llm.sentiment || { signal: 'neutral', confidence: 0 },
      risk: llm.risk || { signal: 'neutral', confidence: 0 },
      aggregate: llm.aggregate || { signal: 'neutral', confidence: 0, verdict: 'HOLD' },
    },
    langraph: payload.language_graph_state || payload.langGraphState || payload.workflow_state || null,
  };
}

/**
 * Dispatch a deep-analysis payload to the appropriate stores.
 */
function dispatchDeepAnalysis(payload) {
  const norm = normaliseDeepAnalysis(payload);

  // MoE consensus → agentStore
  useAgentStore.getState().updateMoEResult({
    technical: norm.agents.technical,
    fundamental: norm.agents.fundamental,
    sentiment: norm.agents.sentiment,
    risk: norm.agents.risk,
    lstm: { signal: norm.lstm.signal, confidence: norm.lstm.confidence, score: norm.lstm.confidence },
    cnn: { signal: norm.cnn.pattern || 'neutral', confidence: norm.cnn.confidence, score: norm.cnn.confidence },
    aggregate: norm.agents.aggregate,
  });

  // LSTM → analysisStore
  if (norm.lstm.signal) {
    useAnalysisStore.getState().setLSTM({
      direction: norm.lstm.direction,
      probability: norm.lstm.confidence,
      confidence: norm.lstm.confidence,
      targetPrice: norm.lstm.price_target,
    });
  }

  // CNN → analysisStore
  if (norm.cnn.pattern) {
    useAnalysisStore.getState().addCNNPattern({
      pattern: norm.cnn.pattern,
      confidence: norm.cnn.confidence,
      type: norm.cnn.pattern_type,
      probabilities: norm.cnn.pattern_probabilities,
    });
  }

  // LangGraph state → agentStore
  if (norm.langraph) {
    useAgentStore.getState().setLangGraphState(norm.langraph);
    if (norm.langraph.phase !== undefined) {
      const phases = ['idle', 'company_overview', 'parallel_analysis', 'bull_bear_debate', 'research_manager', 'trader_decision', 'risk_debate', 'consensus'];
      const label = phases[norm.langraph.phase] || `phase_${norm.langraph.phase}`;
      useAgentStore.getState().setActivePhase(label);
    }
  }
}

/**
 * Connect to the backend WebSocket bridge.
 * @param {string} [url]  Override the socket URL (defaults to :4000).
 * @param {object} [options]  Ignored; kept for API compatibility.
 */
export function connectSocket(url, options = {}) {
  if (socket?.connected) return socket;

  const targetUrl = url || DEFAULT_URL;
  const { token } = useSessionStore.getState();

  // Phase 2 (T3): the backend rejects every connection without a JWT
  // (io.use(makeSocketAuth)). Short-circuit here — the shell route guard
  // will route the user to /login.
  if (!token) {
    useSessionStore.getState().setConnectionError('Unauthorized: no session token');
    emitLocal('auth-error', 'missing token');
    return null;
  }

  socket = io(targetUrl, {
    auth: { token }, // Phase 2 (T3): JWT in the Socket.IO handshake
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
    timeout: 15000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[socket] Connected', socket.id);
    useSessionStore.getState().setConnected(true);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    emitLocal('connect', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason);
    useSessionStore.getState().setConnected(false);
    emitLocal('disconnect', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] Connection error:', err.message);
    useSessionStore.getState().setConnectionError(err.message);
    // Phase 2 (T3): token rejected/expired — drop the socket and the session.
    // logout() clears the token; the shell route guard sees it and redirects.
    if (err.message && err.message.startsWith('AUTH_ERROR')) {
      disconnectSocket();
      useSessionStore.getState().logout();
      emitLocal('auth-error', err.message);
      return;
    }
    emitLocal('connect_error', err);
  });

  // ── Backend → bus bridging ──
  // Backend event names are re-emitted on the bus (and to Zustand stores)
  // under the names the new component stack expects.

  // Live market prices (array of { symbol, price, change, positive })
  socket.on('ticker-update', (data) => emitLocal('ticker-update', data));

  // New AI signal (already stored in DB by the engine)
  socket.on('fx-signal', (data) => emitLocal('signal:new', data));

  // Signal history on connect
  socket.on('signal-history', (history) => {
    const sorted = [...(history || [])].reverse(); // oldest -> newest for UI
    emitLocal('signal-history', sorted);
  });

  // Trade execution confirmation
  socket.on('trade-executed', (trade) => emitLocal('trade:executed', trade));

  // Trade rejected by risk shield / engine
  socket.on('trade-rejected', (data) => emitLocal('trade-rejected', data));

  // Risk stats + settings
  socket.on('risk-stats-update', (stats) => emitLocal('risk-stats-update', stats));
  socket.on('risk-settings-updated', (settings) => emitLocal('risk:update', settings));

  // LLM model management
  socket.on('llm-models-list', (models) => emitLocal('llm-models-list', models));
  socket.on('model-changed', (model) => emitLocal('model-changed', model));

  // Broker status (cTrader). mt5-status is the stable wire name kept for
  // backwards compatibility; broker-status is the same payload under its
  // cTrader name.
  socket.on('mt5-status', (status) => emitLocal('mt5-status', status));
  socket.on('broker-status', (status) => emitLocal('broker-status', status));

  // Vibe research updates
  socket.on('vibe-research-update', (data) => emitLocal('vibe-research-update', data));
  socket.on('positions-update', (data) => emitLocal('positions-update', data));

  // Notifications
  socket.on('notification', (notif) => emitLocal('notification', notif));

  // Deep agent analysis result (agent:analyze response)
  socket.on('analysis:result', (payload) => {
    emitLocal('analysis:result', payload);
    dispatchDeepAnalysis(payload);
  });

  return socket;
}

/**
 * Disconnect from the socket.
 */
export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  useSessionStore.getState().setConnected(false);
  Object.keys(listeners).forEach((event) => delete listeners[event]);
}

/**
 * Get the current socket instance (for direct emit/listen access).
 */
export function getSocket() {
  return socket;
}

// ── Client → backend commands ─────────────────────────────────────────

function requireSocket() {
  if (!socket?.connected) {
    console.warn('[socket] Not connected — command dropped');
    return false;
  }
  return true;
}

/**
 * Emit a raw event through the socket.
 */
export function emit(event, ...args) {
  if (!requireSocket()) return false;
  socket.emit(event, ...args);
  return true;
}

/** Request the list of configured LLM models. */
export function emitGetModels() {
  return emit('get-llm-models');
}

/** Request broker account status (mt5-get-status is the stable wire name). */
export function getMT5Status() {
  return emit('mt5-get-status');
}

/** Request broker account status (cTrader alias of mt5-get-status). */
export function getBrokerStatus() {
  return emit('mt5-get-status');
}

/** Request a broker reconnect (mt5-reconnect is the stable wire name). */
export function mt5Reconnect() {
  return emit('mt5-reconnect');
}

/** Request a broker reconnect (cTrader alias of mt5-reconnect). */
export function brokerReconnect() {
  return emit('mt5-reconnect');
}

/** Pull the current broker positions (broker-positions → positions-update). */
export function getPositions() {
  return emit('broker-positions');
}

/** Place a trade through the risk shield + Python engine. */
export function executeTrade(tradeParams) {
  if (!tradeParams?.symbol || !tradeParams?.action) {
    console.warn('[socket] executeTrade requires symbol + action');
    return false;
  }
  return emit('execute-trade', tradeParams);
}

/** Update risk settings (max drawdown, positions, etc.). */
export function updateRiskSettings(settings) {
  return emit('update-risk-settings', settings);
}

/** Switch the LLM model used by the engine agents. */
export function switchModel(modelName) {
  return emit('switch-llm-model', modelName);
}

/**
 * Request a deep multi-agent analysis from the engine (ENGINE_AGENT_ANALYZE).
 * @param {string} symbol - Currency pair (e.g. 'EUR/USD')
 * @param {object} options - { query, useDeepLearning, useLangGraph, agentKeys, debate_rounds, risk_rounds }
 */
export function requestAnalysis(symbol = 'EUR/USD', options = {}) {
  return emit('agent:analyze', {
    query: options.query || `Perform deep multi-agent analysis of ${symbol}`,
    active_agents: options.agentKeys || null,
    debate_rounds: options.debate_rounds ?? null,
    risk_rounds: options.risk_rounds ?? null,
  });
}

/**
 * Subscribe to live price updates for a symbol.
 * (Backend currently broadcasts ticker-update globally; kept for compatibility.)
 */
export function subscribePrice(symbol) {
  return emit('subscribe:price', { symbol });
}

/** Default export: the socket event bus object */
const socketEventBus = {
  connect: connectSocket,
  disconnect: disconnectSocket,
  isConnected: () => socket?.connected ?? false,
  on,
  off,
  emit,
  emitGetModels,
  getMT5Status,
  getBrokerStatus,
  mt5Reconnect,
  brokerReconnect,
  getPositions,
  executeTrade,
  updateRiskSettings,
  switchModel,
  requestAnalysis,
  subscribePrice,
  getSocket,
};

export default socketEventBus;
