'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import socketEventBus from '@/lib/socketEventBus';

// Same-origin: the built frontend and the backend are served from one URL.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

/**
 * Phase 3 (T6): real research viewer — rows from the vibe_research table
 * (REST GET /api/vibe-research), refreshed live on `vibe-research-update`
 * socket events. Pending rows show a spinner; no mocks.
 */
export default function ResearchPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/vibe-research`);
      if (res.ok) setRows(await res.json());
    } catch (e) {
      console.error('Research load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates from engine research runs
  useEffect(() => {
    const onUpdate = () => load();
    socketEventBus.on('vibe-research-update', onUpdate);
    return () => socketEventBus.off('vibe-research-update', onUpdate);
  }, [load]);

  const statusMeta = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pending' || s === 'running') return { label: 'PENDING', color: 'var(--neon-amber, #ffab00)', icon: Clock };
    if (s === 'done' || s === 'completed' || s === 'complete') return { label: 'DONE', color: 'var(--neon-emerald)', icon: CheckCircle2 };
    if (s === 'error' || s === 'failed') return { label: 'ERROR', color: 'var(--neon-ruby)', icon: XCircle };
    return { label: (status || '—').toUpperCase(), color: 'var(--text-tertiary)', icon: CheckCircle2 };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
          <FlaskConical size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Research & Backtest</h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Engine research runs · live from the DB</p>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin" style={{ color: 'var(--neon-emerald)' }} /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-default)' }}>
          <FlaskConical size={36} className="mx-auto mb-4 opacity-40" style={{ color: 'var(--text-tertiary)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>No research runs recorded yet.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Research runs from the engine (vibe research / alpha discovery) appear here as they complete.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const meta = statusMeta(r.status);
            const StatusIcon = meta.icon;
            const pending = r.status === 'pending' || r.status === 'running';
            return (
              <div key={r.id} className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>#{r.id}</span>
                    <span className="px-2.5 py-1 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider" style={{ background: `${meta.color}1a`, color: meta.color, border: `1px solid ${meta.color}44` }}>
                      {meta.label}
                    </span>
                    {r.run_type && (
                      <span className="px-2.5 py-1 rounded-md font-mono text-[10px] uppercase tracking-wider" style={{ background: 'rgba(0,242,255,0.08)', color: 'var(--neon-cyan)', border: '1px solid rgba(0,242,255,0.2)' }}>
                        {r.run_type}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(r.timestamp).toLocaleString()}
                  </span>
                </div>

                {pending && (
                  <div className="flex items-center gap-2 text-sm font-mono" style={{ color: 'var(--neon-amber, #ffab00)' }}>
                    <Loader2 size={14} className="animate-spin" /> Run in progress…
                  </div>
                )}

                {r.prompt && (
                  <div className="mt-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                    <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Prompt: </span>
                    {r.prompt}
                  </div>
                )}
                {r.command && (
                  <div className="mt-2 text-xs font-mono" style={{ color: 'var(--neon-cyan)' }}>cmd: {r.command}</div>
                )}
                {r.output && !pending && (
                  <pre className="mt-3 p-4 rounded-lg overflow-x-auto text-xs leading-relaxed font-mono" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {r.output}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}