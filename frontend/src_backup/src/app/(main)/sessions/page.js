'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { History, Trophy, Target, TrendingUp, TrendingDown, Loader2, Crosshair } from 'lucide-react';
import useSessionStore from '@/store/sessionStore';

// Same-origin: the built frontend and the backend are served from one URL.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

/**
 * Autonomous-bot sessions — every run the trader_bot persists to
 * data/sessions.jsonl; this page renders the win/loss summary per run
 * so the user can review how the AI bot performed without any influence.
 */
function SummaryCard({ label, value, icon: Icon, accent = 'var(--neon-cyan)' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="neo-card"
      style={{ padding: 'var(--space-md)' }}
    >
      <div className="flex items-center gap-sm" style={{ marginBottom: 'var(--space-xs)' }}>
        <Icon size={15} style={{ color: accent }} />
        <p className="stat-label" style={{ margin: 0 }}>{label}</p>
      </div>
      <p className="text-mono" style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
        {value}
      </p>
    </motion.div>
  );
}

function SessionCard({ session }) {
  const pl = Number(session.net_pl ?? 0);
  const winRate = Number(session.win_rate ?? 0);
  const positive = pl >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="neo-card"
      style={{ padding: 'var(--space-md)' }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-sm)' }}>
        <div className="flex items-center gap-sm">
          <Crosshair size={15} style={{ color: 'var(--neon-cyan)' }} />
          <p className="font-mono" style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
            {new Date(session.ts).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <span className={`badge ${session.mode === 'LIVE' ? 'badge-cyan' : 'badge-gold'} font-mono`}>
          {session.mode || 'AUTO'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 'var(--space-sm)',
        }}
      >
        <div>
          <p className="stat-label" style={{ marginBottom: 2 }}>Trades</p>
          <p className="text-mono" style={{ margin: 0, fontWeight: 700 }}>{session.trades ?? 0}</p>
        </div>
        <div>
          <p className="stat-label" style={{ marginBottom: 2 }}>W / L</p>
          <p className="text-mono" style={{ margin: 0, fontWeight: 700 }}>
            <span style={{ color: 'var(--neon-emerald)' }}>{session.wins ?? 0}</span>
            {' / '}
            <span style={{ color: 'var(--neon-ruby)' }}>{session.losses ?? 0}</span>
          </p>
        </div>
        <div>
          <p className="stat-label" style={{ marginBottom: 2 }}>Win rate</p>
          <p className="text-mono" style={{ margin: 0, fontWeight: 700 }}>{winRate.toFixed(1)}%</p>
        </div>
        <div>
          <p className="stat-label" style={{ marginBottom: 2 }}>Net P&L</p>
          <p
            className="text-mono"
            style={{ margin: 0, fontWeight: 700, color: positive ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}
          >
            {positive ? '+' : ''}${pl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {session.closed && session.closed.length > 0 && (
        <div style={{ marginTop: 'var(--space-sm)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-sm)' }}>
          <p className="stat-label" style={{ marginBottom: 'var(--space-xs)' }}>Closed trades</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {session.closed.map((t, i) => {
              const tPl = Number(t.pl ?? 0);
              const win = tPl >= 0;
              return (
                <div key={i} className="flex items-center justify-between font-mono" style={{ fontSize: '0.75rem' }}>
                  <span>
                    {win ? (
                      <TrendingUp size={12} style={{ color: 'var(--neon-emerald)', marginRight: 4, display: 'inline' }} />
                    ) : (
                      <TrendingDown size={12} style={{ color: 'var(--neon-ruby)', marginRight: 4, display: 'inline' }} />
                    )}
                    {t.symbol} · {t.side} · {Number(t.volume ?? 0).toFixed(2)} lot
                  </span>
                  <span style={{ color: win ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                    {win ? '+' : ''}${tPl.toFixed(2)} <span className="text-muted">({t.reason})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function SessionsPage() {
  const token = useSessionStore((s) => s.token);
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setSummary(data.summary || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: '44px', height: '44px', borderRadius: 'var(--radius-md)',
              background: 'rgba(34, 211, 238, 0.1)', border: '1px solid rgba(34, 211, 238, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <History size={22} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Bot Sessions</h1>
            <p className="text-sm text-white/40 font-mono">Autonomous trading runs · win rate · P&L</p>
          </div>
        </div>
        {summary && (
          <span className="badge badge-cyan font-mono">
            {summary.totalTrades} trades tracked
          </span>
        )}
      </motion.div>

      {error && (
        <div className="neo-card" style={{ padding: 'var(--space-md)', borderColor: 'var(--neon-ruby)' }}>
          <p className="text-muted font-mono" style={{ margin: 0, fontSize: '0.85rem' }}>
            Failed to load sessions: {error}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center" style={{ padding: 'var(--space-xl)' }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--neon-cyan)' }} />
        </div>
      ) : (
        <>
          {/* Aggregated summary */}
          {summary ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 'var(--space-md)',
              }}
            >
              <SummaryCard label="Total trades" value={summary.totalTrades} icon={Crosshair} accent="var(--neon-cyan)" />
              <SummaryCard label="Wins" value={summary.wins} icon={Trophy} accent="var(--neon-emerald)" />
              <SummaryCard label="Losses" value={summary.losses} icon={Target} accent="var(--neon-ruby)" />
              <SummaryCard label="Win rate" value={`${summary.winRate}%`} icon={Target} accent="var(--neon-gold)" />
              <SummaryCard
                label="Net P&L"
                value={`${summary.netPl >= 0 ? '+' : ''}$${summary.netPl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={TrendingUp}
                accent={summary.netPl >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)'}
              />
            </div>
          ) : (
            <div className="neo-card" style={{ padding: 'var(--space-lg)' }}>
              <p className="text-muted font-mono" style={{ margin: 0 }}>
                No completed autonomous runs yet. Start the AI trading bot and it will report each run here.
              </p>
            </div>
          )}

          {/* Per-session cards */}
          {sessions.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-md)' }}>
              {sessions.map((s, i) => (
                <SessionCard key={i} session={s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
