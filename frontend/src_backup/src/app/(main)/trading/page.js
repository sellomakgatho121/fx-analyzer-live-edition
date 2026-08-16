'use client';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  Shield,
  ShieldOff,
  Activity,
  BarChart3,
  SlidersHorizontal,
  Loader2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import useTradingStore from '@/store/tradingStore';
import socketEventBus from '@/lib/socketEventBus';

const SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD'];

/**
 * Phase 3 (T1): live trading desk.
 * Order ticket → execute-trade (risk shield + engine broker).
 * Positions arrive via positions-update (pushed by the engine + broker-positions pull).
 * Kill switch toggles the backend risk_settings.tradingEnabled flag, which the
 * backend execution shield enforces server-side.
 */
export default function TradingPage() {
  const positions = useTradingStore((s) => s.positions);
  const riskSettings = useTradingStore((s) => s.riskSettings);

  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [side, setSide] = useState('BUY');
  const [volume, setVolume] = useState(0.1);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // {ok, message}
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const tradingEnabled = riskSettings.tradingEnabled !== false;

  const refreshPositions = () => {
    setRefreshing(true);
    socketEventBus.getPositions();
    setTimeout(() => setRefreshing(false), 1200);
  };

  useEffect(() => {
    setPositionsLoading(true);
    socketEventBus.getPositions();
    // positions-update flows into store via useSocket; brief loader only
    const t = setTimeout(() => setPositionsLoading(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Execution feedback
  useEffect(() => {
    const onExecuted = (data) => {
      setSubmitting(false);
      setFeedback({ ok: true, message: `Executed ${data.action} ${data.symbol} ${data.volume ?? ''} lot @ ${data.price ?? 'mk'}` });
      setTimeout(refreshPositions, 400);
    };
    const onRejected = (data) => {
      setSubmitting(false);
      setFeedback({ ok: false, message: data.reason || 'Trade rejected by risk shield' });
    };
    socketEventBus.on('trade:executed', onExecuted);
    socketEventBus.on('trade-rejected', onRejected);
    return () => {
      socketEventBus.off('trade:executed', onExecuted);
      socketEventBus.off('trade-rejected', onRejected);
    };
  }, []);

  const submitOrder = () => {
    setFeedback(null);
    setSubmitting(true);
    socketEventBus.executeTrade({
      symbol,
      action: side,
      volume: parseFloat(volume) || 0.01,
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null,
    });
  };

  const toggleKillSwitch = () => {
    socketEventBus.updateRiskSettings({ tradingEnabled: !tradingEnabled });
  };

  const rowStyle = (p) => {
    const pl = Number(p.pl ?? p.profit ?? 0);
    return {
      accent: p.side === 'SELL' ? 'var(--neon-ruby)' : 'var(--neon-emerald)',
      plColor: pl > 0 ? 'var(--neon-emerald)' : pl < 0 ? 'var(--neon-ruby)' : 'var(--text-secondary)',
    };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--gradient-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg-void)' }}>
            <Zap size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Trading Desk</h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Execution via engine broker layer · risk shield active</p>
          </div>
        </div>

        {/* Kill switch */}
        <button
          onClick={toggleKillSwitch}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors"
          style={{
            background: tradingEnabled ? 'rgba(255,51,102,0.1)' : 'rgba(0,255,136,0.12)',
            border: `1px solid ${tradingEnabled ? 'rgba(255,51,102,0.4)' : 'rgba(0,255,136,0.35)'}`,
            color: tradingEnabled ? 'var(--neon-ruby)' : 'var(--neon-emerald)',
          }}
        >
          {tradingEnabled ? <><ShieldOff size={14} /> Kill switch ON</> : <><Shield size={14} /> Trading disabled</>}
        </button>
      </motion.div>

      {feedback && (
        <div className="rounded-lg px-4 py-3 text-sm font-mono" style={{
          background: feedback.ok ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,102,0.08)',
          border: `1px solid ${feedback.ok ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`,
          color: feedback.ok ? 'var(--neon-emerald)' : 'var(--neon-ruby)',
        }}>
          {feedback.message}
        </div>
      )}
      {!tradingEnabled && (
        <div className="rounded-lg px-4 py-3 text-sm font-mono" style={{ background: 'rgba(255,171,0,0.08)', border: '1px solid rgba(255,171,0,0.3)', color: '#ffc94d' }}>
          ⚠ Trading is globally disabled. Flip the kill switch to accept orders.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Order ticket */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
            <BarChart3 size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Order Ticket
          </h3>

          <label className="block text-xs font-mono uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Instrument</label>
          <select className="input mb-4" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {['BUY', 'SELL'].map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className="py-2.5 rounded-lg font-mono text-sm font-bold transition-colors"
                style={{
                  background: side === s ? (s === 'BUY' ? 'rgba(0,255,136,0.14)' : 'rgba(255,51,102,0.14)') : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${side === s ? (s === 'BUY' ? 'var(--neon-emerald)' : 'var(--neon-ruby)') : 'var(--border-default)'}`,
                  color: side === s ? (s === 'BUY' ? 'var(--neon-emerald)' : 'var(--neon-ruby)') : 'var(--text-secondary)',
                }}
              >
                {s === 'BUY' ? <TrendingUp size={13} className="inline mr-1" /> : <TrendingDown size={13} className="inline mr-1" />}
                {s}
              </button>
            ))}
          </div>

          <label className="block text-xs font-mono uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Volume (lots)</label>
          <input
            className="input mb-4"
            type="number"
            step="0.01"
            min="0.01"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Stop Loss</label>
              <input className="input" type="number" step="0.0001" placeholder="1.0800" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Take Profit</label>
              <input className="input" type="number" step="0.0001" placeholder="1.0950" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />
            </div>
          </div>

          <button className="btn btn-primary w-full" onClick={submitOrder} disabled={submitting || !tradingEnabled || !volume}>
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <>Place {side} Order</>}
          </button>
        </div>

        {/* Positions */}
        <div className="lg:col-span-2 rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              <Activity size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Open Positions ({positions.length})
            </h3>
            <button onClick={refreshPositions} className="text-xs font-mono" style={{ color: 'var(--neon-cyan)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          {positionsLoading && positions.length === 0 && (
            <div className="text-sm py-6 text-center font-mono" style={{ color: 'var(--text-tertiary)' }}>
              Pulling positions from broker…
            </div>
          )}

          {!positionsLoading && positions.length === 0 && (
            <div className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
              No open positions. Place an order to see it here — paper trades land instantly.
            </div>
          )}

          <div className="space-y-3">
            {positions.map((p) => {
              const st = rowStyle(p);
              return (
                <div key={p.position_id || p.ticket} className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-default)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${st.accent}22`, color: st.accent, fontSize: 11, fontWeight: 800 }}>
                      {p.side === 'SELL' ? 'S' : 'B'}
                    </div>
                    <div>
                      <div className="font-mono font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{p.symbol}</div>
                      <div className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{p.side} · {p.volume ?? p.lot_size ?? 0} lots</div>
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm">
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Entry</div>
                    <div style={{ color: 'var(--text-primary)' }}>{p.price != null ? Number(p.price).toFixed(5) : p.entry_price?.toFixed?.(5) ?? '—'}</div>
                  </div>
                  <div className="text-right font-mono text-sm">
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>P/L</div>
                    <div style={{ color: st.plColor }}>
                      {p.pl != null || p.profit != null ? `${Number(p.pl ?? p.profit) >= 0 ? '+' : ''}${(Number(p.pl ?? p.profit)).toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div className="flex gap-3 font-mono text-xs">
                    {p.stop_loss != null && <span style={{ color: 'var(--neon-ruby)' }}>SL {p.stop_loss}</span>}
                    {p.take_profit != null && <span style={{ color: 'var(--neon-emerald)' }}>TP {p.take_profit}</span>}
                  </div>
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{p.position_id || `#${p.ticket}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Risk panel */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
          <SlidersHorizontal size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Risk Shield Limits
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Max Daily Drawdown', value: `$${riskSettings.maxDailyDrawdown ?? 500}` },
            { label: 'Max Open Positions', value: riskSettings.maxOpenPositions ?? 3 },
            { label: 'Max Risk / Trade', value: `${riskSettings.maxRiskPerTrade ?? 2}%` },
            { label: 'Max Daily Trades', value: riskSettings.maxDailyTrades ?? 5 },
            { label: 'Min Confidence', value: `${Math.round((riskSettings.minConfidence ?? 0.7) * 100)}%` },
          ].map((l) => (
            <div key={l.label} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-default)' }}>
              <div className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{l.label}</div>
              <div className="font-mono font-bold text-lg mt-1" style={{ color: 'var(--neon-emerald)' }}>{l.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}