'use client';
import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, TrendingDown, Activity, AlertTriangle, Target, Zap, Shield, BarChart3, Loader2 } from 'lucide-react';
import Link from 'next/link';
import useSessionStore from '@/store/sessionStore';
import socketEventBus from '@/lib/socketEventBus';

// Same-origin: the built frontend and the backend are served from one URL.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

/**
 * Phase 3 (T4): real signal detail — fetched from the DB via
 * GET /api/signals/:id (raw_data holds the full engine payload).
 * EXECUTE sends an execute-trade command to the broker/engine.
 *
 * Static-export compatible: the signal id is read from the query string
 * (?id=123) instead of a dynamic route segment.
 */
function SignalDetailsPage() {
  const params = useSearchParams();
  const id = params.get('id');
  const token = useSessionStore((s) => s.token);

  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execFeedback, setExecFeedback] = useState(null); // {ok, message}

  const fetchSignal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/signals/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSignal(await res.json());
    } catch (err) {
      console.error('Failed to fetch signal:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (token) fetchSignal();
  }, [token, fetchSignal]);

  // Live execution feedback
  useEffect(() => {
    const onExecuted = (data) => {
      if (String(data.signalId) === String(id)) {
        setExecuting(false);
        setExecFeedback({ ok: true, message: `Executed ${data.action} ${data.symbol} @ ${data.price}${data.ticket ? ` · ticket ${data.ticket}` : ''}` });
      }
    };
    const onRejected = (data) => {
      setExecuting(false);
      setExecFeedback({ ok: false, message: data.reason || 'Trade rejected' });
    };
    socketEventBus.on('trade:executed', onExecuted);
    socketEventBus.on('trade-rejected', onRejected);
    return () => {
      socketEventBus.off('trade:executed', onExecuted);
      socketEventBus.off('trade-rejected', onRejected);
    };
  }, [id]);

  const handleExecute = () => {
    setExecFeedback(null);
    setExecuting(true);
    socketEventBus.executeTrade({
      signalId: signal.id,
      symbol: signal.symbol,
      action: signal.action,
      price: signal.price,
      confidence: signal.confidence,
      stopLoss: signal.stop_loss ?? null,
      takeProfit: signal.take_profit ?? null,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--neon-emerald)' }} />
      </div>
    );
  }

  if (notFound || !signal) {
    return (
      <div className="p-10 text-center" style={{ color: 'var(--text-secondary)' }}>
        <BarChart3 size={40} className="mx-auto mb-4 opacity-40" />
        <p>Signal not found — it may have been cleared or the id is invalid.</p>
        <Link href="/dashboard" style={{ color: 'var(--neon-emerald)' }}>← Back to dashboard</Link>
      </div>
    );
  }

  const isBuy = signal.action === 'BUY';
  const accent = isBuy ? 'var(--neon-emerald)' : 'var(--neon-ruby)';
  const agentBreakdown = signal.agent_breakdown || {};
  const breakdownAgents = Array.isArray(agentBreakdown)
    ? agentBreakdown
    : Object.entries(agentBreakdown).map(([name, score]) => ({ name, score }));

  return (
    <div className="min-h-screen p-6 md:p-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm mb-6"
          style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
        >
          <ArrowLeft size={16} /> Back to dashboard
        </Link>

        {/* Header card */}
        <div className="rounded-2xl p-6 md:p-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--glow-subtle)' }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                  Signal #{signal.id} · {new Date(signal.timestamp || Date.now()).toLocaleString()}
                </span>
                {signal.source && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono" style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--neon-emerald)', border: '1px solid rgba(0,255,136,0.2)' }}>
                    {signal.source}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                  {signal.symbol?.replace('/', '') ?? '—'}
                </h1>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-sm font-bold"
                  style={{
                    background: isBuy ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,102,0.12)',
                    color: accent,
                    border: `1px solid ${accent}44`,
                  }}
                >
                  {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {signal.action}
                </span>
              </div>
              <div className="flex flex-wrap gap-6 mt-4">
                <div>
                  <div className="text-xs font-mono uppercase" style={{ color: 'var(--text-tertiary)' }}>Entry Price</div>
                  <div className="text-xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {signal.price != null ? signal.price.toFixed(5) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono uppercase" style={{ color: 'var(--text-tertiary)' }}>Confidence</div>
                  <div className="text-xl font-bold font-mono" style={{ color: accent }}>
                    {signal.confidence != null ? `${(signal.confidence * 100).toFixed(0)}%` : '—'}
                  </div>
                </div>
                {signal.take_profit != null && (
                  <div>
                    <div className="text-xs font-mono uppercase flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <Target size={11} /> Take Profit
                    </div>
                    <div className="text-lg font-bold font-mono" style={{ color: 'var(--neon-emerald)' }}>{signal.take_profit.toFixed(5)}</div>
                  </div>
                )}
                {signal.stop_loss != null && (
                  <div>
                    <div className="text-xs font-mono uppercase flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <Shield size={11} /> Stop Loss
                    </div>
                    <div className="text-lg font-bold font-mono" style={{ color: 'var(--neon-ruby)' }}>{signal.stop_loss.toFixed(5)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Execute card */}
            <div className="rounded-xl p-5 w-full md:w-56" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-default)' }}>
              <div className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                Execution
              </div>
              {signal.execution && (
                <div className="text-xs mb-3 font-mono" style={{ color: signal.execution.status === 'executed' ? 'var(--neon-emerald)' : 'var(--text-secondary)' }}>
                  {signal.execution.status === 'executed' ? `Auto-executed · ticket ${signal.execution.ticket ?? '—'}` : `Auto-exec ${signal.execution.status ?? 'skipped'}`}
                </div>
              )}
              <button
                onClick={handleExecute}
                disabled={executing || (signal.execution?.status === 'executed')}
                className="btn btn-primary w-full"
              >
                {executing ? (
                  <><Loader2 size={14} className="animate-spin" /> Executing…</>
                ) : signal.execution?.status === 'executed' ? (
                  <><Shield size={14} /> Executed</>
                ) : (
                  <><Zap size={14} /> Execute Trade</>
                )}
              </button>
              {execFeedback && (
                <div
                  className="mt-3 text-xs p-2 rounded"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: execFeedback.ok ? 'var(--neon-emerald)' : 'var(--neon-ruby)',
                    background: execFeedback.ok ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,102,0.08)',
                    border: `1px solid ${execFeedback.ok ? 'rgba(0,255,136,0.25)' : 'rgba(255,51,102,0.25)'}`,
                  }}
                >
                  {execFeedback.message}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-6">
          {/* AI reasoning */}
          <div className="md:col-span-2 rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
              AI Reasoning
            </h3>
            <p className="text-lg leading-relaxed font-light border-l-2 pl-4" style={{ color: 'var(--text-primary)', borderColor: accent }}>
              {signal.ai_reasoning || 'No reasoning recorded for this signal.'}
            </p>

            {breakdownAgents.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  Agent Breakdown (MoE)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {breakdownAgents.map((a) => {
                    const score = typeof a.score === 'number' ? a.score : parseFloat(a.score) || 0;
                    return (
                      <div
                        key={a.name || 'agent'}
                        className="px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-default)' }}
                      >
                        <div className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{a.name}</div>
                        <div className="font-mono font-bold text-sm" style={{ color: score > 0.6 ? accent : 'var(--text-primary)' }}>
                          {(score * 100).toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {signal.risk_factors && (
              <div className="mt-6 p-4 rounded-lg flex gap-3 items-start" style={{ background: 'rgba(255,171,0,0.08)', border: '1px solid rgba(255,171,0,0.2)' }}>
                <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--neon-amber, #ffab00)' }} />
                <span className="text-sm" style={{ color: 'rgba(255,200,80,0.9)' }}>{signal.risk_factors}</span>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
                <Activity size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Trade Details
              </h3>
              <div className="space-y-2 text-sm font-mono">
                <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Instrument</span><span>{signal.symbol}</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Direction</span><span style={{ color: accent }}>{signal.action}</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Entry</span><span>{signal.price != null ? signal.price.toFixed(5) : '—'}</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-tertiary)' }}>Confidence</span><span>{signal.confidence != null ? `${(signal.confidence * 100).toFixed(0)}%` : '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function SignalsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--neon-emerald)' }} />
        </div>
      }
    >
      <SignalDetailsPage />
    </Suspense>
  );
}
