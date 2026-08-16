'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Clock, TrendingUp, TrendingDown, BarChart3, Filter } from 'lucide-react';

export default function TrackRecordLedger({ signals = [] }) {
  const [filter, setFilter] = useState('all'); // all, profitable, loss
  const [ledger, setLedger] = useState([]);

  // Build ledger from signal history with P&L verification
  useEffect(() => {
    if (!signals.length) return;

    // Fail-closed verification: P&L is only computed from a real exit price.
    // No simulated "verification against current market" — signals without a
    // closed exit stay 'open'/'pending' with zero P&L.
    const verified = signals.map((sig) => {
      const entry = sig.entry || sig.price || null;

      let pnlPips = 0;
      let status = 'pending';

      if (entry != null && sig.exitPrice != null) {
        // Closed trade — calculate real P&L from the actual exit price
        if (sig.action === 'BUY') {
          pnlPips = (sig.exitPrice - entry) * 10000;
        } else if (sig.action === 'SELL') {
          pnlPips = (entry - sig.exitPrice) * 10000;
        }
        status = pnlPips >= 0 ? 'profit' : 'loss';
      } else if (entry != null) {
        status = 'open';
      }

      return {
        ...sig,
        pnlPips: Math.round(pnlPips * 10) / 10,
        verified: status !== 'open' && status !== 'pending',
        status,
      };
    });

    setLedger(verified);
  }, [signals]);

  const filtered = ledger.filter((s) => {
    if (filter === 'profitable') return s.status === 'profit';
    if (filter === 'loss') return s.status === 'loss';
    return true;
  });

  const totalTrades = ledger.filter(s => s.verified).length;
  const wins = ledger.filter(s => s.status === 'profit').length;
  const losses = ledger.filter(s => s.status === 'loss').length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '—';
  const totalPnl = ledger.reduce((sum, s) => sum + (s.pnlPips || 0), 0).toFixed(1);

  const statusIcon = (status) => {
    if (status === 'profit') return <CheckCircle size={14} style={{ color: '#00ff88' }} />;
    if (status === 'loss') return <XCircle size={14} style={{ color: '#ff3366' }} />;
    return <Clock size={14} style={{ color: 'var(--text-tertiary)' }} />;
  };

  return (
    <div className="neo-card" style={{ padding: 'var(--space-lg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BarChart3 size={18} style={{ color: '#00f2ff' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Track Record</h3>
          <span className="badge badge-cyan">{totalTrades} verified</span>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {['all', 'profitable', 'loss'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 12px', borderRadius: '6px', border: 'none',
                fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.05em', cursor: 'pointer',
                background: filter === f ? 'rgba(0,242,255,0.1)' : 'transparent',
                color: filter === f ? '#00f2ff' : 'var(--text-tertiary)',
                transition: 'all 0.15s',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px',
      }}>
        <div style={{ textAlign: 'center', padding: '12px', borderRadius: '10px', background: 'var(--bg-elevated)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700 }}>{totalTrades}</div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginTop: '4px' }}>Total</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', borderRadius: '10px', background: 'var(--bg-elevated)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: '#00ff88' }}>{wins}</div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginTop: '4px' }}>Wins</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', borderRadius: '10px', background: 'var(--bg-elevated)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: '#ff3366' }}>{losses}</div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginTop: '4px' }}>Losses</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', borderRadius: '10px', background: 'var(--bg-elevated)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: '#00f2ff' }}>{winRate}%</div>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginTop: '4px' }}>Win Rate</div>
        </div>
      </div>

      {/* Ledger Table */}
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
              No signals to display. Signals will appear here as they are generated and verified.
            </div>
          ) : (
            filtered.map((entry, idx) => (
              <motion.div
                key={`${entry.timestamp}-${idx}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: '8px',
                  borderBottom: '1px solid var(--border-subtle)',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {statusIcon(entry.status)}
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{entry.symbol}</span>
                    <span style={{
                      marginLeft: '8px', fontSize: '0.6875rem', fontWeight: 700,
                      color: entry.action === 'BUY' ? '#00ff88' : entry.action === 'SELL' ? '#ff3366' : 'var(--text-tertiary)',
                    }}>{entry.action}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {entry.confidence ? `${(entry.confidence * 100).toFixed(0)}%` : '—'}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 700,
                    color: entry.pnlPips >= 0 ? '#00ff88' : '#ff3366',
                    minWidth: '60px', textAlign: 'right',
                  }}>
                    {entry.pnlPips >= 0 ? '+' : ''}{entry.pnlPips} pips
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Total P&L Footer */}
      {totalTrades > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)',
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
            Net P&L
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '1.125rem', fontWeight: 800,
            color: parseFloat(totalPnl) >= 0 ? '#00ff88' : '#ff3366',
          }}>
            {parseFloat(totalPnl) >= 0 ? '+' : ''}{totalPnl} pips
          </span>
        </div>
      )}
    </div>
  );
}
