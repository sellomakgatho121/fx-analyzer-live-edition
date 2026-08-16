'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import MetricDetailsModal from '@/components/MetricDetailsModal';
import ErrorBoundary from '@/components/ErrorBoundary';
import socketEventBus from '@/lib/socketEventBus';
import { useTradingStore } from '@/store';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Zap,
  TrendingUp,
  BarChart3,
  Shield,
  Wifi,
  WifiOff,
  RefreshCw,
  Bot,
  RotateCcw,
  DollarSign, // Added for StatsCard
  ShieldCheck // Added for StatsCard
} from 'lucide-react';

import TickerBar from '@/components/TickerBar';
import CandlestickChartEnhanced from '@/components/CandlestickChartEnhanced';
import SignalCard from '@/components/SignalCard';
import TradePanel from '@/components/TradePanel';
import HistoryTable from '@/components/HistoryTable';
import StatsCard from '@/components/StatsCard';
import PairSelector from '@/components/PairSelector';
import TradingModeToggle from '@/components/TradingModeToggle';
import PaperTradingDashboard from '@/components/PaperTradingDashboard';
import ModelSelector from '@/components/ModelSelector';
import AgentDebate from '@/components/AgentDebate';
import TrackRecordLedger from '@/components/TrackRecordLedger';
import AIRecommender from '@/components/AIRecommender';
import VibeResearchTerminal from '@/components/VibeResearchTerminal';
import CtraderAccountPanel from '@/components/CtraderAccountPanel';
import AutoTradeSettings from '@/components/AutoTradeSettings';
import TradeListPanel from '@/components/TradeListPanel';
import { CURRENCY_PAIRS, getPairBySymbol } from '@/data/currencyPairs';
import PaperTradingEngine from '@/lib/paperTrading';
import { NotificationProvider, useNotification } from '@/context/NotificationContext';
import { AlertService } from '@/lib/AlertService';

export default function DashboardMain() {
  return (
    <NotificationProvider>
      <Dashboard />
    </NotificationProvider>
  );
}

function Dashboard() {
  const [selectedPair, setSelectedPair] = useState(CURRENCY_PAIRS[0]); // Default to EUR/USD
  const selectedPairRef = useRef(selectedPair);
  const [favorites, setFavorites] = useState(['EURUSD', 'GBPUSD', 'USDJPY']);
  const [signals, setSignals] = useState([]);
  const [trades, setTrades] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [tickerData, setTickerData] = useState([]);

  // Socket Ref
  const socketRef = useRef(null);

  // Risk Shield State — live values arrive via risk-stats-update / risk:update;
  // settings come from the tradingStore (real data when available).
  const [riskStats, setRiskStats] = useState({ profitLoss: 0, openPositions: 0 });
  const riskSettings = useTradingStore((s) => s.riskSettings);
  const updateRiskSettings = useTradingStore((s) => s.updateRiskSettings);

  // Paper Trading State
  const [tradingMode, setTradingMode] = useState('paper'); // 'paper' or 'live'
  const [paperEngine] = useState(() => new PaperTradingEngine(10000));
  const [paperMetrics, setPaperMetrics] = useState(paperEngine.getMetrics());
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [showPaperDashboard, setShowPaperDashboard] = useState(false);
  const paperEngineRef = useRef(paperEngine);

  const riskShieldRef = useRef(null);
  const audioContextRef = useRef(null);

  const handleMetricClick = (label, value, variant, icon) => {
    setSelectedMetric({ label, value, variant, icon });
  };

  // Auto-Trading State (Paper Mode Only)
  const [isAutoTrading, setIsAutoTrading] = useState(false);

  // Notification Hook
  const { addNotification } = useNotification();

  // Live stats from the tradingStore — zero/neutral until risk-stats-update
  // or addSignal populates real numbers.
  const stats = useTradingStore((s) => s.stats);

  // --- Persistence Logic ---
  useEffect(() => {
    // Load state on mount
    const savedState = localStorage.getItem('fx_paper_state');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        paperEngine.importState(parsed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
        setPaperMetrics(paperEngine.getMetrics());
      } catch (e) {
        console.error('Failed to load paper trading state', e);
      }
    }
  }, [paperEngine]); // Run once on mount (paperEngine is stable)

  // Save state on metrics change
  useEffect(() => {
    if (tradingMode === 'paper') {
      const state = paperEngine.exportState();
      localStorage.setItem('fx_paper_state', JSON.stringify(state));
    }
  }, [paperMetrics, tradingMode, paperEngine]);

  // Sync trades state from paper engine when metrics change
  useEffect(() => {
    if (tradingMode === 'paper') {
      const engineTrades = paperEngine.getAllTrades();
      setTrades(engineTrades);
    }
  }, [paperMetrics, tradingMode, paperEngine]);

  // --- Socket Connection & Event Listeners ---
  // Uses the app-wide shared socket (socketEventBus) — one connection for the
  // whole app, honoring NEXT_PUBLIC_SOCKET_URL. Initialized once on mount,
  // not on pair change.
  useEffect(() => {
    socketEventBus.connect();
    socketRef.current = socketEventBus.getSocket();

    const unsubs = [
      socketEventBus.on('connect', () => {
        setIsConnected(true);
      }),

      socketEventBus.on('disconnect', () => {
        setIsConnected(false);
      }),

      socketEventBus.on('ticker-update', (data) => {
        setTickerData(Array.isArray(data) ? data : []);
      }),

      socketEventBus.on('signal:new', (signal) => {
        // Play alert for high confidence
        if (signal.confidence > 0.85) {
          AlertService.playSignalAlert(signal.confidence);
        }

        // Use the ref to avoid stale closure on selectedPair
        const currentPair = selectedPairRef.current;

        // Only show signals for the selected pair
        if (signal.symbol === currentPair.name || signal.symbol === currentPair.symbol) {
          setSignals(prev => [signal, ...prev].slice(0, 10));
          // totalSignals is already incremented by useSocket → tradingStore.addSignal

          // Notify about new signal
          addNotification(
            'signal',
            `New Signal: ${signal.symbol}`,
            `${signal.action} @ ${signal.entry?.toFixed(5) || 'Market'} (${(signal.confidence * 100).toFixed(0)}% confidence)`
          );
        }
      }),

      socketEventBus.on('signal-history', (history) => {
        // history is [oldest, ..., newest] -> reverse to [newest, ..., oldest]
        const sortedHistory = [...history].reverse();

        // Use the ref to avoid stale closure on selectedPair
        const currentPair = selectedPairRef.current;

        // Filter for selected pair
        const relevantSignals = sortedHistory.filter(s =>
          s.symbol === currentPair.name || s.symbol === currentPair.symbol
        );

        setSignals(relevantSignals);
      }),

      // Risk Shield Listeners
      socketEventBus.on('risk-stats-update', (newStats) => {
        setRiskStats(prev => ({ ...prev, ...newStats }));
      }),

      socketEventBus.on('trade-rejected', (data) => {
        addNotification('error', 'Order Rejected', data.reason);
      }),

      socketEventBus.on('trade:executed', (trade) => {
        // Live trade confirmed by backend
        if (trade) {
          setTrades(prev => [{
            id: trade.ticket || `live-${Date.now()}`,
            symbol: trade.symbol,
            action: trade.action,
            entryPrice: trade.executionPrice || trade.price,
            entry: trade.executionPrice || trade.price,
            lotSize: trade.volume || trade.lotSize || 0.01,
            openTime: trade.executedAt || new Date().toISOString(),
            status: 'open',
            profit: 0,
            pips: 0,
            type: 'manual',
          }, ...prev]);

          addNotification('success', 'Order Filled', `${trade.action} ${trade.symbol} @ ${trade.executionPrice || trade.price}`);
        }
      }),

      // Engine notifications (e.g. DAILY_BRIEFING) — emitted directly as an
      // object now, not wrapped in a raw "notification <json>" string.
      socketEventBus.on('notification', (notif) => {
        if (notif && notif.type === 'DAILY_BRIEFING') {
          addNotification(
            'info',
            `Daily Briefing: ${notif.date}`,
            `Analyzed ${notif.market_scan?.length || 0} Assets. High-Impact Events: ${notif.events?.length || 0}`
          );
        }
      }),
    ];

    return () => {
      // Only unsubscribe — the shared socket stays alive for other consumers
      unsubs.forEach((unsub) => unsub());
      socketRef.current = null;
    };
  // Only initialize socket once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-trading effect: executes paper trades when new signals arrive
  const prevSignalCountRef = useRef(0);
  useEffect(() => {
    if (!isAutoTrading || tradingMode !== 'paper' || signals.length === 0) {
      prevSignalCountRef.current = signals.length;
      return;
    }

    // Only react to NEW signals (ones we haven't processed yet)
    if (signals.length > prevSignalCountRef.current) {
      const newSignals = signals.slice(0, signals.length - prevSignalCountRef.current);
      prevSignalCountRef.current = signals.length;

      newSignals.forEach(signal => {
        const result = paperEngine.executeTrade({
          symbol: signal.symbol,
          action: signal.action,
          price: signal.entry || currentPrice,
          lotSize: 0.01,
          sl: signal.sl,
          tp: signal.tp,
          type: 'auto'
        });

        if (result.success) {
          setTrades(prev => [result.trade, ...prev]);
          setPaperMetrics(paperEngine.getMetrics());
          addNotification(
            'trade',
            `Auto-Trade: ${signal.action} ${signal.symbol}`,
            `Entry: ${result.trade.entryPrice.toFixed(5)} | Slippage: ${result.slippagePips.toFixed(1)} pips`
          );
        } else {
          addNotification('error', 'Auto-Trade Failed', result.reason);
        }
      });
    } else {
      prevSignalCountRef.current = signals.length;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, isAutoTrading, tradingMode]);

  const handlePriceUpdate = useCallback((price) => {
    setCurrentPrice(price);
  }, []);

  const handlePairChange = useCallback((pair) => {
    setSelectedPair(pair);
    selectedPairRef.current = pair;
    setSignals([]); // Clear signals when switching pairs
  }, []);

  const handleToggleFavorite = useCallback((symbol) => {
    setFavorites(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  }, []);

  const handleExecute = useCallback((signal) => {
    // Fail-closed: never execute without a real market price from the feed.
    if (currentPrice == null) {
      addNotification('error', 'No Market Price', 'Waiting for a live tick from the cTrader feed before executing.');
      return;
    }

    if (tradingMode === 'paper') {
      // Execute paper trade
      const result = paperEngine.executeTrade({
        symbol: signal.symbol,
        action: signal.action,
        price: currentPrice,
        lotSize: signal.lotSize || 0.01,
        sl: signal.sl,
        tp: signal.tp,
        type: 'manual'
      });

      if (result.success) {
        console.log('Paper trade executed:', result.trade);
        setPaperMetrics(paperEngine.getMetrics());
        setTrades(prev => [result.trade, ...prev]);
      } else {
        console.warn('Paper trade failed:', result.reason);
      }
    } else {
      // Live trading - Emit to backend
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('execute-trade', {
          ...signal,
          price: currentPrice,
          timestamp: new Date().toISOString()
        });
        addNotification('info', 'Sending Order', 'Validating with Risk Shield...');
      } else {
        addNotification('error', 'Connection Error', 'Cannot execute trade - Engine disconnected');
      }
    }

    // Track the open position in the shared store stats
    useTradingStore.getState().setStats({
      activeTrades: useTradingStore.getState().stats.activeTrades + 1,
    });
  }, [tradingMode, paperEngine, currentPrice, addNotification]);

  // TradePanel execution handler — accepts callback for UI feedback
  const handleTradePanelExecute = useCallback((tradeData, resultCallback) => {
    if (tradingMode === 'paper') {
      const result = paperEngine.executeTrade({
        symbol: tradeData.symbol,
        action: tradeData.action,
        price: tradeData.price,
        lotSize: tradeData.lotSize || 0.01,
        sl: tradeData.sl,
        tp: tradeData.tp,
        type: 'manual'
      });

      if (result.success) {
        setPaperMetrics(paperEngine.getMetrics());
        setTrades(prev => [result.trade, ...prev]);
        resultCallback({ success: true, trade: result.trade });
        addNotification('trade', `${tradeData.action} ${tradeData.symbol}`, `Paper entry at ${tradeData.price.toFixed(5)}`);
      } else {
        resultCallback({ success: false, reason: result.reason });
        addNotification('error', 'Paper Trade Failed', result.reason);
      }
    } else {
      // Live — emit to socket backend
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('execute-trade', {
          symbol: tradeData.symbol,
          action: tradeData.action,
          volume: tradeData.lotSize || 0.01,
          price: tradeData.price,
          timestamp: tradeData.timestamp,
        });
        addNotification('info', 'Sending Live Order', 'Validating with Risk Shield...');

        // Listen for confirmation
        const onExecuted = (trade) => {
          socketRef.current.off('trade-executed', onExecuted);
          socketRef.current.off('trade-rejected', onRejected);
          resultCallback({ success: true, trade });
        };
        const onRejected = (data) => {
          socketRef.current.off('trade-executed', onExecuted);
          socketRef.current.off('trade-rejected', onRejected);
          resultCallback({ success: false, reason: data.reason });
        };
        socketRef.current.once('trade-executed', onExecuted);
        socketRef.current.once('trade-rejected', onRejected);
      } else {
        resultCallback({ success: false, reason: 'Engine disconnected' });
        addNotification('error', 'Connection Error', 'Cannot execute trade - Engine disconnected');
      }
    }

    // Track the open position in the shared store stats
    useTradingStore.getState().setStats({
      activeTrades: useTradingStore.getState().stats.activeTrades + 1,
    });
  }, [tradingMode, paperEngine, currentPrice, addNotification]);

  const handleModeChange = useCallback((mode) => {
    setTradingMode(mode);
    if (mode === 'paper') {
      setPaperMetrics(paperEngine.getMetrics());
    }
  }, [paperEngine]);

  const handleResetPaper = useCallback(() => {
    setTrades([]);
    paperEngine.reset();
    setPaperMetrics(paperEngine.getMetrics());
    addNotification('success', 'Paper Account Reset', 'Balance restored to $10,000.00');
  }, [paperEngine, addNotification]);

  // Reset Signals & Engine
  const handleResetAll = useCallback(() => {
    setSignals([]);
    setTrades([]);
    paperEngine.reset();
    setPaperMetrics(paperEngine.getMetrics());
    // Neutral stats — no hardcoded values
    useTradingStore.getState().setStats({
      winRate: 0,
      activeTrades: 0,
      profit: 0,
      totalSignals: 0,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      pnl: 0,
    });
    addNotification('success', 'System Reset', 'All signals cleared and paper account reset.');
  }, [paperEngine, addNotification]);

  // Auto-Trade Risk Settings Update
  const handleUpdateRiskSettings = useCallback((newSettings) => {
    updateRiskSettings(newSettings);
    // Sync to backend if live mode
    if (socketRef.current?.connected) {
      socketRef.current.emit('update-risk-settings', newSettings);
    }
  }, [updateRiskSettings]);

  // Toggle Auto-Trading (Paper Mode Only)
  const handleToggleAutoTrading = useCallback(() => {
    if (tradingMode !== 'paper') {
      addNotification('error', 'Auto-Trading Disabled', 'Auto-trading is only available in Paper mode for safety.');
      return;
    }

    setIsAutoTrading(prev => {
      const newState = !prev;
      // Use setTimeout to defer the notification out of the render cycle
      setTimeout(() => {
        addNotification(
          newState ? 'success' : 'info',
          newState ? 'Auto-Trading Enabled' : 'Auto-Trading Disabled',
          newState ? 'New signals will be auto-executed in paper mode.' : 'Manual execution required.'
        );
      }, 0);
      return newState;
    });
  }, [tradingMode, addNotification]);

  // Update paper positions with current prices
  useEffect(() => {
    if (tradingMode === 'paper' && paperEngine.positions.length > 0) {
      const interval = setInterval(() => {
        paperEngine.updatePositions({ [selectedPair.symbol]: currentPrice });
        setPaperMetrics(paperEngine.getMetrics());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [tradingMode, paperEngine, selectedPair, currentPrice]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen" style={{ background: 'var(--bg-void)' }}>
        {/* Ticker Bar — live engine prices via ticker-update */}
        <TickerBar liveData={tickerData} />

        {/* Header */}
        <header
          style={{
            padding: 'var(--space-lg) var(--space-xl)',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-deep)',
          }}
        >
          <div
            className="flex justify-between items-center"
            style={{ maxWidth: '1600px', margin: '0 auto' }}
          >
            <div className="flex items-center gap-lg">
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-black">
                    FX
                  </div>
                  <span className="font-bold tracking-tight text-lg">
                    NEXUS <span className="text-cyan-500">PRO</span>
                  </span>
                </div>
                <p className="text-body text-muted" style={{ marginTop: '4px', fontSize: '0.75rem' }}>
                  Institutional-grade algorithmic signals & cTrader execution
                </p>
              </motion.div>

              {/* Pair Selector */}
              <PairSelector
                selectedPair={selectedPair}
                onPairChange={handlePairChange}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
              />
            </div>

            <div className="flex items-center gap-lg">
              <PaperTradingDashboard
                onModeChange={handleModeChange}
                paperMetrics={paperMetrics}
              />

              {/* LLM Model Selector - New Feature */}
              {socketRef.current && (
                <ModelSelector socket={socketRef.current} />
              )}

              {/* Paper Analytics Button */}
              {tradingMode === 'paper' && (
                <button
                  onClick={() => setShowPaperDashboard(true)}
                  className="btn-ghost flex items-center gap-xs"
                  style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <BarChart3 size={14} />
                  <span>Paper Analytics</span>
                </button>
              )}

              {/* Auto-Trade Toggle (Paper Mode Only) */}
              {tradingMode === 'paper' && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleToggleAutoTrading}
                  className="flex items-center gap-xs"
                  style={{
                    padding: 'var(--space-sm) var(--space-md)',
                    background: isAutoTrading ? 'rgba(0, 255, 136, 0.1)' : 'transparent',
                    border: `1px solid ${isAutoTrading ? 'var(--neon-emerald)' : 'var(--border-default)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: isAutoTrading ? 'var(--neon-emerald)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.875rem'
                  }}
                >
                  <Bot size={14} />
                  <span>{isAutoTrading ? 'Auto ON' : 'Auto OFF'}</span>
                  {isAutoTrading && (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--neon-emerald)'
                      }}
                    />
                  )}
                </motion.button>
              )}

              {/* Reset All Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleResetAll}
                className="btn-ghost flex items-center gap-xs"
                style={{
                  padding: 'var(--space-sm) var(--space-md)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)'
                }}
                title="Reset signals and paper account"
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </motion.button>

              {/* Connection Status */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="neo-card flex items-center gap-sm p-md"
              >
                {isConnected ? (
                  <>
                    <Wifi size={16} className="text-emerald" />
                    <span className="text-caption text-emerald">ONLINE</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={16} className="text-ruby" />
                    <span className="text-caption text-ruby">OFFLINE</span>
                  </>
                )}
              </motion.div>

              {/* Refresh Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="btn btn-ghost"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={16} />
              </motion.button>
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <section style={{ padding: 'var(--space-xl)', maxWidth: '1600px', margin: '0 auto' }}>
          <div className="stats-grid">
            <StatsCard
              label="Win Rate"
              value={tradingMode === 'paper' ? paperMetrics.winRate : stats.winRate}
              suffix="%"
              variant={tradingMode === 'paper' && paperMetrics.winRate >= 50 ? 'success' : 'info'}
              icon={TrendingUp}
              onClick={() => handleMetricClick('Win Rate', tradingMode === 'paper' ? paperMetrics.winRate : stats.winRate, tradingMode === 'paper' && paperMetrics.winRate >= 50 ? 'success' : 'info', TrendingUp)}
            />
            <StatsCard
              label="Active Trades"
              value={tradingMode === 'paper' ? paperMetrics.openPositions : stats.activeTrades}
              icon={Activity}
              onClick={() => handleMetricClick('Active Trades', tradingMode === 'paper' ? paperMetrics.openPositions : stats.activeTrades, 'default', Activity)}
            />
            <StatsCard
              label="Total Profit"
              value={tradingMode === 'paper' ? paperMetrics.totalProfit : stats.profit}
              prefix={tradingMode === 'paper' && paperMetrics.totalProfit < 0 ? '-$' : '+$'}
              variant={tradingMode === 'paper' ? (paperMetrics.totalProfit >= 0 ? 'success' : 'danger') : 'success'}
              icon={BarChart3}
              onClick={() => handleMetricClick('Total Profit', tradingMode === 'paper' ? paperMetrics.totalProfit : stats.profit, tradingMode === 'paper' ? (paperMetrics.totalProfit >= 0 ? 'success' : 'danger') : 'success', BarChart3)}
            />
            <StatsCard
              label="Signals Today"
              value={stats.totalSignals}
              icon={Zap}
              onClick={() => handleMetricClick('Signals Today', stats.totalSignals, 'default', Zap)}
            />
          </div>
        </section>

        {/* Main Dashboard Grid */}
        <main style={{ padding: '0 var(--space-xl) var(--space-xl)', maxWidth: '1600px', margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 380px',
              gap: 'var(--space-lg)',
            }}
          >
            {/* Left Column - Chart & Signals */}
            <div className="flex flex-col gap-lg">
              {/* Candlestick Chart — real candles from the cTrader feed (fails closed) */}
              <CandlestickChartEnhanced
                symbol={selectedPair.name}
                onPriceUpdate={handlePriceUpdate}
                trades={trades}
              />

              {/* AI Recommender — non-obtrusive insight panel */}
              <AIRecommender signals={signals} symbol={selectedPair.name} />

              {/* Signals Section */}
              <div>
                <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-md)' }}>
                  <Zap size={18} className="text-cyan" />
                  <h2 className="text-headline">Live Signals</h2>
                  <span className="badge badge-cyan">{signals.length}</span>
                </div>

                <div className="flex flex-col gap-md">
                  <AnimatePresence mode="popLayout">
                    {signals.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="neo-card p-xl"
                        style={{ textAlign: 'center' }}
                      >
                        <Activity size={48} className="text-muted" style={{ margin: '0 auto 16px' }} />
                        <p className="text-body text-muted">Waiting for market signals...</p>
                        <p className="text-caption" style={{ marginTop: '8px' }}>
                          Make sure the backend server is running on port 4000
                        </p>
                      </motion.div>
                    ) : (
                      signals.map((signal, idx) => (
                        <SignalCard
                          key={`${signal.timestamp}-${idx}`}
                          signal={signal}
                          onExecute={handleExecute}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Track Record Ledger — P&L verification */}
              <TrackRecordLedger signals={signals} />

              {/* Vibe AI Research Terminal — Automated Backtests & Alpha Zoo */}
              <VibeResearchTerminal socket={socketRef.current} />

              {/* Trade History List */}
              <TradeListPanel trades={trades} />
            </div>

            {/* Right Column - Trade Panel */}
            <div className="flex flex-col gap-lg">
              <TradePanel
                currentPrice={currentPrice}
                symbol={selectedPair.name}
                onExecute={handleTradePanelExecute}
                tradingMode={tradingMode}
                socket={socketRef.current}
              />

              {/* Risk Shield Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="neo-card-cyan neo-card p-lg"
              >
                <div className="flex items-center gap-sm" style={{ marginBottom: '16px' }}>
                  <Shield size={18} className="text-cyan" />
                  <h3 className="text-title">Risk Shield</h3>
                  <span className="badge badge-emerald">ACTIVE</span>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div className="flex justify-between" style={{ marginBottom: '8px' }}>
                    <span className="text-caption">Daily Drawdown Limit</span>
                    <span className="text-mono text-muted">
                      {riskStats.maxDailyDrawdown != null
                        ? `$${Math.abs(riskStats.profitLoss ?? 0).toFixed(0)} / $${riskStats.maxDailyDrawdown}`
                        : '—'}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill progress-fill-cyan"
                      style={{
                        width: riskStats.maxDailyDrawdown > 0
                          ? `${Math.min((Math.abs(riskStats.profitLoss ?? 0) / riskStats.maxDailyDrawdown) * 100, 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between" style={{ marginBottom: '8px' }}>
                    <span className="text-caption">Max Open Positions</span>
                    <span className="text-mono text-muted">
                      {riskStats.openPositions} / {riskSettings.maxOpenPositions || '—'}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill progress-fill-emerald"
                      style={{
                        width: riskSettings.maxOpenPositions > 0
                          ? `${Math.min((riskStats.openPositions / riskSettings.maxOpenPositions) * 100, 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              </motion.div>

              {/* cTrader Account Panel */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                <CtraderAccountPanel socket={socketRef.current} />
              </motion.div>

              {/* Auto-Trade Settings */}
              {tradingMode === 'paper' && (
                <AutoTradeSettings
                  isAutoTrading={isAutoTrading}
                  onToggleAutoTrade={handleToggleAutoTrading}
                  tradingMode={tradingMode}
                  riskSettings={riskSettings}
                  onUpdateRiskSettings={handleUpdateRiskSettings}
                />
              )}
            </div>
          </div>

          {/* History Table Section */}
          <section style={{ marginTop: 'var(--space-xl)' }}>
            <HistoryTable />
          </section>
        </main>

        {/* Footer */}
        <footer
          style={{
            padding: 'var(--space-lg) var(--space-xl)',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
          }}
        >
          <p className="text-caption text-muted">
            FX Analyzer Pro • Powered by OpenCode Zen AI • Not financial advice
          </p>
        </footer>

        {/* Modals */}
        <AnimatePresence>
          {showPaperDashboard && (
            <PaperTradingDashboard
              key="paper-dashboard"
              engine={paperEngine}
              onReset={handleResetPaper}
              onUpdate={() => setPaperMetrics(paperEngine.getMetrics())}
              onClose={() => setShowPaperDashboard(false)}
            />
          )}

          {selectedMetric && (
            <MetricDetailsModal
              key="metric-modal"
              metric={selectedMetric}
              onClose={() => setSelectedMetric(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
