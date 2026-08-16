'use client';
import { useEffect, useRef, useCallback } from 'react';
import socketEventBus from '@/lib/socketEventBus';
import { useSessionStore, useTradingStore, useUIStore } from '@/store';

/**
 * useSocket — React hook that bridges socket.io events to Zustand stores.
 *
 * Call once at the app root inside (main)/layout.js after authentication.
 *
 * Handles:
 *  - Connection lifecycle → sessionStore
 *  - Signal events → tradingStore
 *  - Trade execution → tradingStore
 *  - Risk settings/stats → tradingStore
 *  - Model changes → sessionStore
 */
export default function useSocket() {
  const initialized = useRef(false);

  // ── Session store actions ──────────────────────────────────────────
  const setConnected = useSessionStore((s) => s.setConnected);
  const setConnectionError = useSessionStore((s) => s.setConnectionError);
  const setModelName = useSessionStore((s) => s.setModelName);
  const setLastSignalTime = useSessionStore((s) => s.setLastSignalTime);

  // ── Trading store actions ──────────────────────────────────────────
  const addSignal = useTradingStore((s) => s.addSignal);
  const setSignals = useTradingStore((s) => s.setSignals);
  const executeTrade = useTradingStore((s) => s.executeTrade);
  const updateRiskSettings = useTradingStore((s) => s.updateRiskSettings);
  const setStats = useTradingStore((s) => s.setStats);
  const setPositions = useTradingStore((s) => s.setPositions);
  const setCurrentPrice = useTradingStore((s) => s.setCurrentPrice);
  const setLastTickerSource = useTradingStore((s) => s.setLastTickerSource);
  const setAccountBalance = useTradingStore((s) => s.setAccountBalance);

  // ── Connect callback ───────────────────────────────────────────────
  const connect = useCallback(() => {
    if (initialized.current) return;

    socketEventBus.connect();

    initialized.current = true;

    // ── Connection lifecycle ─────────────────────────────────────────
    socketEventBus.on('connect', () => {
      setConnected(true);
      socketEventBus.emitGetModels();
    });

    socketEventBus.on('disconnect', () => {
      setConnected(false);
    });

    socketEventBus.on('connect_error', (err) => {
      setConnectionError(err.message);
    });

    // ── Signal events ────────────────────────────────────────────────
    socketEventBus.on('signal:new', (signal) => {
      addSignal(signal);
      setLastSignalTime(signal.timestamp || new Date().toISOString());
    });

    socketEventBus.on('signal-history', (history) => {
      const sorted = [...history].reverse();
      setSignals(sorted);
    });

    // ── Market data events ───────────────────────────────────────────
    // ticker-update carries an array of { symbol, price, change, positive,
    // source?, ts? }. Keep the currently-selected pair's price in the store
    // so non-chart UI (TradePanel, stores) can read a live price.
    socketEventBus.on('ticker-update', (data) => {
      if (!Array.isArray(data) || data.length === 0) return;
      const pair = useUIStore.getState().activePair;
      if (!pair) return;
      const ticker = data.find(
        (t) =>
          t?.symbol?.replace('/', '') === pair.symbol ||
          t?.symbol === pair.name
      );
      const price = ticker ? parseFloat(ticker.price) : NaN;
      if (Number.isFinite(price)) {
        setCurrentPrice(price);
        if (ticker.source === 'engine' || ticker.source === 'mock') {
          setLastTickerSource(ticker.source);
        }
      }
    });

    // ── Account events ───────────────────────────────────────────────
    // mt5-status is the stable wire name; broker-status is the cTrader alias
    // of the same payload. Both feed the shared account balance.
    const onBrokerStatus = (status) => {
      if (status && typeof status.balance === 'number') {
        setAccountBalance(status.balance);
      }
    };
    socketEventBus.on('mt5-status', onBrokerStatus);
    socketEventBus.on('broker-status', onBrokerStatus);

    // ── Trade events ─────────────────────────────────────────────────
    socketEventBus.on('trade:executed', (trade) => {
      executeTrade(trade);
    });

    socketEventBus.on('trade-rejected', (data) => {
      console.warn('[useSocket] Trade rejected:', data.reason);
    });

    // ── Position events (Phase 3) ────────────────────────────────────
    socketEventBus.on('positions-update', (data) => {
      setPositions(data?.positions || []);
    });

    // ── Risk events ──────────────────────────────────────────────────
    socketEventBus.on('risk:update', (settings) => {
      updateRiskSettings(settings);
    });

    socketEventBus.on('risk-stats-update', (stats) => {
      setStats(stats);
    });

    // ── System events ────────────────────────────────────────────────
    socketEventBus.on('model-changed', (model) => {
      setModelName(model);
    });

    socketEventBus.on('notification', (notif) => {
      if (notif?.type === 'DAILY_BRIEFING') {
        console.log('[useSocket] Daily briefing received:', notif.date);
      }
    });
  }, [
    setConnected,
    setConnectionError,
    setModelName,
    setLastSignalTime,
    addSignal,
    setSignals,
    executeTrade,
    updateRiskSettings,
    setStats,
    setPositions,
    setCurrentPrice,
    setLastTickerSource,
    setAccountBalance,
  ]);

  // ── Auto-connect on mount ──────────────────────────────────────────
  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount (but don't disconnect if we're just re-rendering)
    };
  }, [connect]);

  // Return event bus for direct emit access
  return socketEventBus;
}
