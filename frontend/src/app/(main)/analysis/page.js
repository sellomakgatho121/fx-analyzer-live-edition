'use client';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  BrainCircuit,
  Sparkles,
  Activity,
  TrendingUp,
  Sigma,
  Loader2,
  Play,
} from 'lucide-react';
import DeepLearningPanel from '@/components/DeepLearningPanel';
import FeatureImportanceChart from '@/components/FeatureImportanceChart';
import PatternDisplayCard from '@/components/PatternDisplayCard';
import useAnalysisStore from '@/store/analysisStore';
import useAgentStore from '@/store/agentStore';
import socketEventBus from '@/lib/socketEventBus';

const TABS = [
  { id: 'deep', label: 'Deep Learning', icon: BrainCircuit },
  { id: 'technical', label: 'Technical', icon: Activity },
  { id: 'patterns', label: 'Patterns', icon: Sigma },
  { id: 'fundamental', label: 'Fundamental', icon: TrendingUp },
];

const SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD'];

// feature_importance: [{name, importance}] → {name: importance}
const importanceToObject = (arr) => {
  if (!Array.isArray(arr)) return {};
  return arr.reduce((acc, f) => {
    if (f && f.name !== undefined) acc[f.name] = f.importance ?? 0;
    return acc;
  }, {});
};

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState('deep');
  const [symbol, setSymbol] = useState('EUR/USD');
  const [running, setRunning] = useState(false);
  const [resultAt, setResultAt] = useState(null);
  const [error, setError] = useState(null);

  // Store-backed state (populated by dispatchDeepAnalysis on analysis:result)
  const lstm = useAnalysisStore((s) => s.lstmPrediction);
  const cnnPatterns = useAnalysisStore((s) => s.cnnPatterns);
  const technical = useAnalysisStore((s) => s.technicalIndicators);
  const fundamental = useAnalysisStore((s) => s.fundamentalContext);
  const moe = useAgentStore((s) => s.moeConsensus);

  // Live payload (latest analysis:result) — holds report/features text
  const [raw, setRaw] = useState(null);

  useEffect(() => {
    const onResult = (payload) => {
      setRunning(false);
      setError(payload.status === 'error' ? payload.message : null);
      setRaw(payload);
      setResultAt(new Date().toISOString());
    };
    socketEventBus.on('analysis:result', onResult);
    return () => socketEventBus.off('analysis:result', onResult);
  }, []);

  const runAnalysis = () => {
    setRunning(true);
    setError(null);
    socketEventBus.requestAnalysis(symbol, { query: `Perform deep multi-agent analysis of ${symbol}` });
  };

  // Derived panel props from the raw engine payload
  const dl = raw?.deep_analysis || {};
  const lstmData = dl.lstm
    ? {
        report: dl.lstm.report || null,
        confidence: dl.lstm.confidence ?? lstm.confidence,
        signal: dl.lstm.prediction || dl.lstm.direction || lstm.direction,
        price_target: dl.lstm.price_target ?? lstm.targetPrice,
        features: importanceToObject(dl.lstm.feature_importance),
      }
    : {
        report: null,
        confidence: lstm.confidence,
        signal: lstm.direction,
        price_target: lstm.targetPrice,
        features: {},
      };
  const cnnData = dl.cnn
    ? {
        report: dl.cnn.report || null,
        confidence: dl.cnn.confidence ?? (cnnPatterns[0]?.confidence ?? 0),
        signal: cnnPatterns[0]?.pattern || dl.cnn.pattern || 'neutral',
        pattern: dl.cnn.pattern || cnnPatterns[0]?.pattern || null,
        rule_patterns: dl.cnn.rule_patterns || [],
      }
    : null;

  const ActiveIcon = TABS.find((t) => t.id === activeTab)?.icon || BarChart3;
  const lastRun = resultAt ? new Date(resultAt).toLocaleTimeString() : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--gradient-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg-void)' }}>
            <BrainCircuit size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>AI Analysis Lab</h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>LSTM · CNN · MoE consensus — live engine output</p>
          </div>
        </div>

        {/* Run analysis */}
        <div className="flex items-center gap-2">
          <select
            className="input"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            style={{ width: 130 }}
            aria-label="Instrument"
          >
            {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary" onClick={runAnalysis} disabled={running}>
            {running ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><Play size={13} /> Run Analysis</>}
          </button>
        </div>
      </motion.div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm font-mono" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: 'var(--neon-ruby)' }}>
          {error}
        </div>
      )}
      {resultAt && !running && (
        <div className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
          Last result: {lastRun} · {symbol}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b pb-px" style={{ borderColor: 'var(--border-default)' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-mono uppercase tracking-wider transition-colors"
            style={{
              background: activeTab === id ? 'rgba(0,255,136,0.08)' : 'transparent',
              color: activeTab === id ? 'var(--neon-emerald)' : 'var(--text-secondary)',
              borderBottom: activeTab === id ? '2px solid var(--neon-emerald)' : '2px solid transparent',
            }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Panels */}
      <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {activeTab === 'deep' && (
          <DeepLearningPanel
            lstmData={lstmData.signal !== 'neutral' || lstmData.report ? lstmData : null}
            cnnData={cnnData?.pattern ? cnnData : null}
          />
        )}

        {activeTab === 'technical' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
                <Activity size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Indicator Matrix
              </h3>
              <div className="grid grid-cols-2 gap-3 font-mono text-sm">
                <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>RSI</div>
                  <div style={{ color: technical.rsi > 70 || technical.rsi < 30 ? 'var(--neon-ruby)' : 'var(--neon-emerald)' }}>{technical.rsi?.toFixed?.(1) ?? technical.rsi}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>ATR</div>
                  <div>{technical.atr?.toFixed?.(4) ?? technical.atr}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>MACD</div>
                  <div>{technical.macd?.value?.toFixed?.(5) ?? technical.macd?.value}</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>MA20 / MA50</div>
                  <div>{technical.movingAverages?.ma20?.toFixed?.(5) ?? '—'} / {technical.movingAverages?.ma50?.toFixed?.(5) ?? '—'}</div>
                </div>
              </div>
              {moe?.technical && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <span className="text-xs font-mono uppercase" style={{ color: 'var(--text-tertiary)' }}>Technical Agent:</span>
                  <span className="font-mono font-bold" style={{ color: moe.technical.signal === 'bullish' ? 'var(--neon-emerald)' : moe.technical.signal === 'bearish' ? 'var(--neon-ruby)' : 'var(--text-primary)' }}>
                    {(moe.technical.signal || 'neutral').toUpperCase()} {(moe.technical.confidence ? `· ${(moe.technical.confidence * 100).toFixed(0)}%` : '')}
                  </span>
                </div>
              )}
            </div>
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
                Feature Importance
              </h3>
              <FeatureImportanceChart features={lstmData.features} />
            </div>
          </div>
        )}

        {activeTab === 'patterns' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cnnPatterns.length === 0 && (
              <div className="p-6 rounded-2xl text-center col-span-full" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-default)', color: 'var(--text-secondary)' }}>
                No patterns detected yet — run an analysis to see CNN chart-pattern output.
              </div>
            )}
            {cnnPatterns.map((p) => (
              <PatternDisplayCard
                key={p.id || p.pattern}
                pattern={p.pattern || p.type}
                confidence={p.confidence ?? 0}
                signal={p.signal || 'neutral'}
                rulePatterns={p.rule_patterns || []}
              />
            ))}
          </div>
        )}

        {activeTab === 'fundamental' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
                <Sparkles size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Fundamental Context
              </h3>
              <div className="text-sm space-y-3">
                <div className="flex justify-between font-mono">
                  <span style={{ color: 'var(--text-tertiary)' }}>News Sentiment</span>
                  <span style={{ color: fundamental.newsSentiment === 'positive' ? 'var(--neon-emerald)' : fundamental.newsSentiment === 'negative' ? 'var(--neon-ruby)' : 'var(--text-primary)' }}>
                    {(fundamental.newsSentiment || 'neutral').toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between font-mono">
                  <span style={{ color: 'var(--text-tertiary)' }}>Central Bank Policy</span>
                  <span>{fundamental.centralBankPolicy || '—'}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span style={{ color: 'var(--text-tertiary)' }}>High-Impact Events</span>
                  <span>{fundamental.highImpactEvents?.length ?? 0}</span>
                </div>
              </div>
              {moe?.fundamental && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <span className="text-xs font-mono uppercase" style={{ color: 'var(--text-tertiary)' }}>Fundamental Agent:</span>
                  <span className="font-mono font-bold" style={{ color: moe.fundamental.signal === 'bullish' ? 'var(--neon-emerald)' : moe.fundamental.signal === 'bearish' ? 'var(--neon-ruby)' : 'var(--text-primary)' }}>
                    {(moe.fundamental.signal || 'neutral').toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-tertiary)' }}>
                <TrendingUp size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Consensus
              </h3>
              {moe?.aggregate ? (
                <>
                  <div className="text-3xl font-bold text-center py-4" style={{ fontFamily: 'var(--font-display)', color: moe.aggregate.signal === 'bullish' ? 'var(--neon-emerald)' : moe.aggregate.signal === 'bearish' ? 'var(--neon-ruby)' : 'var(--text-primary)' }}>
                    {(moe.aggregate.verdict ?? moe.aggregate.signal ?? 'HOLD').toUpperCase()}
                  </div>
                  <div className="text-center text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    confidence {(moe.aggregate.confidence ?? 0.5) * 100}%
                  </div>
                </>
              ) : (
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Awaiting engine consensus.</div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}