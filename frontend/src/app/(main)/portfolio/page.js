'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PieChart, TrendingUp, Trophy, Crosshair, Loader2 } from 'lucide-react';
import useTradingStore from '@/store/tradingStore';
import useSessionStore from '@/store/sessionStore';
import socketEventBus from '@/lib/socketEventBus';

// Same-origin: the built frontend and the backend are served from one URL.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const STARTING_BALANCE = 10000; // paper account seed

/**
 * Phase 3 (T5): real portfolio — trades + stats from the DB (REST),
 * equity curve derived from cumulative closed P/L, refreshed on
 * trade:executed so executed signals appear instantly.
 */
export default function PortfolioPage() {
  const token = useSessionStore((s) => s.token);
  const positions = useTradingStore((s) => s.positions);

  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [tradesRes, statsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/trades`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/api/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (tradesRes.ok) setTrades(await tradesRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      console.error('Portfolio load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  // Live refresh when a trade executes
  useEffect(() => {
    const onExecuted = () => setTimeout(load, 600);
    const onClosed = () => setTimeout(load, 600);
    socketEventBus.on('trade:executed', onExecuted);
    socketEventBus.on('trade:closed', onClosed);
    return () => {
      socketEventBus.off('trade:executed', onExecuted);
      socketEventBus.off('trade:closed', onClosed);
    };
  }, [load]);

  // Equity curve: cumulative closed P/L from oldest → newest
  const curve = useMemoEquity(trades);
  const openExposure = positions.reduce((sum, p) => sum + (Number(p.volume ?? p.lot_size ?? 0) || 0), 0);
  const netPnl = curve.length ? curve[curve.length - 1].equity - STARTING_BALANCE : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fb923c' }}>
          <PieChart size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Portfolio & Risk</h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Real P&L from executed trades · equity curve · risk shield</p>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin" style={{ color: 'var(--neon-emerald)' }} /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Net P&L', value: `${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`, color: netPnl >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)', icon: TrendingUp },
              { label: 'Win Rate', value: `${stats?.winRate ?? 0}%`, color: 'var(--neon-cyan)', icon: Trophy },
              { label: 'Total Trades', value: stats?.totalTrades ?? 0, color: 'var(--text-primary)', icon: Crosshair },
              { label: 'Open Exposure', value: `${openExposure.toFixed(2)} lots`, color: 'var(--neon-amber, #ffab00)', icon: PieChart },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="p-5 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{c.label}</span>
                    <Icon size={15} style={{ color: c.color }} />
                  </div>
                  <div className="text-2xl font-bold font-mono" style={{ color: c.color }}>{c.value}</div>
                </div>
              );
            })}
          </div>

          {/* Equity curve */}
          <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
              <TrendingUp size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Equity Curve
            </h3>
            {curve.length < 2 ? (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Not enough closed trades yet — execute a signal and the curve appears here.
              </div>
            ) : (
              <EquityChart curve={curve} />
            )}
          </div>

          {/* Recent trades */}
          <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>Recent Trades</h3>
            {trades.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                No trades executed yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr style={{ color: 'var(--text-tertiary)', textAlign: 'left', fontSize: 11, textTransform: 'uppercase' }}>
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4">Symbol</th>
                      <th className="pb-2 pr-4">Action</th>
                      <th className="pb-2 pr-4">Entry</th>
                      <th className="pb-2 pr-4">Exit</th>
                      <th className="pb-2 pr-4">P/L</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text-secondary)' }}>{new Date(t.timestamp).toLocaleString()}</td>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text-primary)' }}>{t.symbol}</td>
                        <td className="py-2.5 pr-4" style={{ color: t.action === 'SELL' ? 'var(--neon-ruby)' : 'var(--neon-emerald)' }}>{t.action}</td>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text-secondary)' }}>{t.entry_price != null ? Number(t.entry_price).toFixed(5) : '—'}</td>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text-secondary)' }}>{t.exit_price != null ? Number(t.exit_price).toFixed(5) : '—'}</td>
                        <td className="py-2.5 pr-4" style={{ color: t.pl != null && t.pl >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                          {t.pl != null ? `${t.pl >= 0 ? '+' : ''}${Number(t.pl).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase" style={{ background: t.status === 'closed' ? 'rgba(0,242,255,0.1)' : 'rgba(0,255,136,0.1)', color: t.status === 'closed' ? 'var(--neon-cyan)' : 'var(--neon-emerald)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Cumulative equity points from trades (oldest → newest). Fail-closed:
 * trades with an unknown P/L (pl == null) are skipped, never counted as 0. */
function useMemoEquity(trades) {
  const sorted = [...trades]
    .filter((t) => t.pl != null)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let equity = STARTING_BALANCE;
  const pts = sorted.map((t) => {
    equity += Number(t.pl);
    return { t: new Date(t.timestamp).getTime(), equity: +equity.toFixed(2) };
  });
  return pts;
}

/** Minimal inline-SVG area chart — no chart dependency */
function EquityChart({ curve }) {
  const W = 760;
  const H = 220;
  const pad = 12;
  const min = Math.min(STARTING_BALANCE, ...curve.map((p) => p.equity));
  const max = Math.max(STARTING_BALANCE, ...curve.map((p) => p.equity));
  const span = Math.max(max - min, 1);
  const x = (i) => pad + (i / Math.max(curve.length - 1, 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
  const line = curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const area = `${line} L${x(curve.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const up = curve[curve.length - 1].equity >= STARTING_BALANCE;
  const stroke = up ? '#00ff88' : '#ff3366';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }} preserveAspectRatio="none">
      <line x1={pad} y1={y(STARTING_BALANCE)} x2={W - pad} y2={y(STARTING_BALANCE)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
      <path d={area} fill={stroke} opacity={0.08} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} />
      {curve.map((p, i) =>
        i === curve.length - 1 ? <circle key={i} cx={x(i)} cy={y(p.equity)} r={4} fill={stroke} /> : null
      )}
    </svg>
  );
}