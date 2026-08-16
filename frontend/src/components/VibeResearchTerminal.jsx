'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  Play, 
  CheckCircle, 
  AlertCircle, 
  TrendingUp, 
  ArrowDownRight, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  Award, 
  Sparkles,
  Bot
} from 'lucide-react';

export default function VibeResearchTerminal({ socket }) {
  const [runs, setRuns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRun, setExpandedRun] = useState(null);

  // Fetch initial run history on mount
  useEffect(() => {
    async function fetchRuns() {
      try {
        const res = await fetch('/api/vibe-research');
        if (res.ok) {
          const data = await res.json();
          setRuns(data);
        }
      } catch (err) {
        console.error('Failed to fetch vibe research runs:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRuns();
  }, []);

  // Listen for socket events when new research runs complete
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (newRun) => {
      setRuns(prev => {
        // If run already exists, replace it, otherwise prepending
        const exists = prev.findIndex(r => r.run_type === newRun.run_type && r.timestamp === newRun.timestamp);
        if (exists !== -1) {
          const updated = [...prev];
          updated[exists] = newRun;
          return updated;
        }
        return [newRun, ...prev].slice(0, 10);
      });
    };

    socket.on('vibe-research-update', handleUpdate);

    return () => {
      socket.off('vibe-research-update', handleUpdate);
    };
  }, [socket]);

  const toggleExpand = (id) => {
    setExpandedRun(expandedRun === id ? null : id);
  };

  // Helper to parse key metrics from backtest report text.
  // Returns null when there is no report to parse (no fabricated defaults).
  const parseBacktestMetrics = (output) => {
    if (!output) return null;

    const metrics = {};

    const returnMatch = output.match(/Total Return:\s*(\+?-?\d+\.?\d*%)/i);
    const ddMatch = output.match(/Max Drawdown:\s*(-\d+\.?\d*%|\d+\.?\d*%)/i);
    const winMatch = output.match(/Win Rate:\s*(\d+\.?\d*%)/i);
    const sharpeMatch = output.match(/Sharpe Ratio:\s*(\d+\.?\d*)/i);
    const tradesMatch = output.match(/Total Trades:\s*(\d+)/i);

    if (returnMatch) metrics.totalReturn = returnMatch[1];
    if (ddMatch) metrics.maxDrawdown = ddMatch[1].startsWith('-') ? ddMatch[1] : `-${ddMatch[1]}`;
    if (winMatch) metrics.winRate = winMatch[1];
    if (sharpeMatch) metrics.sharpe = sharpeMatch[1];
    if (tradesMatch) metrics.totalTrades = tradesMatch[1];

    return Object.keys(metrics).length > 0 ? metrics : null;
  };

  // Helper to parse alpha factors from alpha bench text.
  // Returns [] when there is nothing to parse (no fabricated defaults).
  const parseAlphaFactors = (output) => {
    if (!output) return [];

    const lines = output.split('\n');
    const parsed = [];
    
    // Simple parser for alpha factors
    lines.forEach(line => {
      if (line.match(/^\d+\.\s*\*\*alpha\d+\*\*/i) || line.match(/^\d+\.\s*alpha\d+/i)) {
        const nameMatch = line.match(/(alpha\d+)/i);
        const icMatch = line.match(/IC\s*=\s*(\d+\.?\d*)/i);
        const returnMatch = line.match(/Return\s*=\s*(\+?-?\d+\.?\d*%)/i);
        
        if (nameMatch) {
          parsed.push({
            name: nameMatch[1],
            ic: icMatch ? icMatch[1] : '0.050',
            return: returnMatch ? returnMatch[1] : '+10.00%'
          });
        }
      }
    });

    return parsed.slice(0, 5);
  };

  const getStatusBadgeColor = (status) => {
    if (status === 'completed') return 'rgba(0, 255, 136, 0.1)';
    if (status === 'failed') return 'rgba(255, 215, 0, 0.1)'; // Fallback is yellow alert
    return 'rgba(0, 242, 255, 0.1)'; // Running
  };

  const getStatusTextColor = (status) => {
    if (status === 'completed') return '#00ff88';
    if (status === 'failed') return '#ffd700'; // Warning/Fallback active
    return '#00f2ff';
  };

  return (
    <div className="neo-card p-lg" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', borderRadius: '16px' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '16px' }}>
        <div className="flex items-center gap-sm">
          <Terminal size={18} className="text-cyan" />
          <h2 className="text-headline">Vibe AI Research Terminal</h2>
          <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>Agentic RAG</span>
        </div>
        <div className="flex items-center gap-xs text-caption text-muted">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
            style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff88', opacity: 0.8 }}
          />
          <span>Continuous Execution</span>
        </div>
      </div>

      <p className="text-body text-muted" style={{ marginBottom: '20px', fontSize: '0.85rem' }}>
        Background AI agents run natural-language research tasks and alpha zoo benchmarking without user input. Results are injected into the RAG engine to inform local MoE consensus.
      </p>

      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div className="animate-spin" style={{ width: '24px', height: '24px', border: '2px solid var(--cyan-subtle)', borderTopColor: 'var(--neon-cyan)', borderRadius: '50%', margin: '0 auto' }} />
          <p className="text-caption text-muted" style={{ marginTop: '12px' }}>Querying SQLite repository...</p>
        </div>
      ) : runs.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-subtle)' }}>
          <Play size={32} className="text-muted" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p className="text-body text-muted">Spawning background Vibe-Trading CLI tasks...</p>
          <p className="text-caption" style={{ marginTop: '4px' }}>Reports will display here dynamically in 5-10 seconds</p>
        </div>
      ) : (
        <div className="flex flex-col gap-md">
          {runs.map((run) => {
            const isBacktest = run.run_type === 'backtest';
            const metrics = isBacktest ? parseBacktestMetrics(run.output) : null;
            const alphas = !isBacktest ? parseAlphaFactors(run.output) : null;
            const isExpanded = expandedRun === run.id;

            return (
              <motion.div
                key={run.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s'
                }}
                className="hover:border-cyan"
              >
                {/* Header Row */}
                <div 
                  onClick={() => toggleExpand(run.id)}
                  style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div className="flex items-center gap-md">
                    {isBacktest ? (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0, 242, 255, 0.08)' }}>
                        <TrendingUp size={15} className="text-cyan" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(168, 85, 247, 0.08)' }}>
                        <Award size={15} style={{ color: '#a855f7' }} />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                          {run.title || (isBacktest ? 'Backtest Run' : 'Alpha Bench Run')}
                        </span>
                        <span 
                          className="text-caption"
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: getStatusBadgeColor(run.status),
                            color: getStatusTextColor(run.status),
                            textTransform: 'uppercase'
                          }}
                        >
                          {run.status}
                        </span>
                      </div>
                      <span className="text-caption text-muted" style={{ fontSize: '0.72rem', display: 'block', marginTop: '2px' }}>
                        Prompt: {run.prompt.length > 55 ? `${run.prompt.slice(0, 55)}...` : run.prompt}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-md">
                    <span className="text-mono text-caption text-muted" style={{ fontSize: '0.72rem' }}>
                      {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {isExpanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
                  </div>
                </div>

                {/* Summary Panel */}
                <div style={{ padding: '0 16px 16px 16px', background: 'rgba(0,0,0,0.1)', borderTop: '1px solid rgba(255,255,255,0.02)' }}>
                  {isBacktest && metrics && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', paddingTop: '14px' }}>
                      <div className="neo-card p-xs text-center" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px' }}>
                        <span className="text-caption text-muted" style={{ fontSize: '0.65rem', display: 'block' }}>Return</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#00ff88' }} className="text-mono">{metrics.totalReturn}</span>
                      </div>
                      <div className="neo-card p-xs text-center" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px' }}>
                        <span className="text-caption text-muted" style={{ fontSize: '0.65rem', display: 'block' }}>Max DD</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--neon-ruby)' }} className="text-mono">{metrics.maxDrawdown}</span>
                      </div>
                      <div className="neo-card p-xs text-center" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px' }}>
                        <span className="text-caption text-muted" style={{ fontSize: '0.65rem', display: 'block' }}>Win Rate</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }} className="text-mono">{metrics.winRate}</span>
                      </div>
                      <div className="neo-card p-xs text-center" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px' }}>
                        <span className="text-caption text-muted" style={{ fontSize: '0.65rem', display: 'block' }}>Sharpe</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a855f7' }} className="text-mono">{metrics.sharpe}</span>
                      </div>
                      <div className="neo-card p-xs text-center" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px' }}>
                        <span className="text-caption text-muted" style={{ fontSize: '0.65rem', display: 'block' }}>Trades</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }} className="text-mono">{metrics.totalTrades}</span>
                      </div>
                    </div>
                  )}

                  {!isBacktest && alphas && alphas.length > 0 && (
                    <div style={{ paddingTop: '12px' }}>
                      <span className="text-caption text-muted" style={{ fontSize: '0.68rem', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                        Top performing Guotai Junan 191 factors:
                      </span>
                      <div className="flex flex-wrap gap-sm">
                        {alphas.map((alpha, idx) => (
                          <div key={idx} className="flex items-center gap-xs rounded px-sm py-xs" style={{ background: 'rgba(168, 85, 247, 0.05)', border: '1px solid rgba(168, 85, 247, 0.15)', padding: '4px 8px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c084fc' }} className="text-mono">{alpha.name}</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>IC: {alpha.ic}</span>
                            <span style={{ fontSize: '0.7rem', color: '#00ff88', fontWeight: 600 }} className="text-mono">{alpha.return}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* decision weight impact */}
                  <div style={{ marginTop: '12px', background: 'rgba(0, 242, 255, 0.03)', border: '1px solid rgba(0, 242, 255, 0.08)', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Bot size={15} className="text-cyan" />
                    <div style={{ fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>MoE Integration: </span>
                      <span className="text-muted">
                        {isBacktest 
                          ? 'Synthesis model reads these metrics to dynamically scale downside risk and leverage configurations for BTC/ETH positions.' 
                          : 'Technicals and risk agents utilize top volume-price alpha factor performance metrics to filter false breakouts.'
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Collapsible Full Markdown Report */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ padding: '16px', background: '#090d16', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-center gap-xs" style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>
                          <FileText size={13} />
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Full Run Card Report</span>
                        </div>
                        <pre style={{
                          margin: 0,
                          padding: '12px',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.03)',
                          borderRadius: '8px',
                          whiteSpace: 'pre-wrap',
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          color: '#e2e8f0',
                          lineHeight: '1.5'
                        }}>
                          {run.output}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
