'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Users,
  LayoutGrid,
  Loader2,
  Play,
  Sparkles,
} from 'lucide-react';
import DebateTimeline from '@/components/agent-arena/DebateTimeline';
import MoEEnhanced from '@/components/agent-arena/MoEEnhanced';
import useAgentStore from '@/store/agentStore';
import socketEventBus from '@/lib/socketEventBus';

const VIEWS = [
  { id: 'langgraph', label: 'LangGraph Debate', icon: Users },
  { id: 'moe', label: 'MoE Consensus', icon: LayoutGrid },
];

const SYMBOLS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'XAU/USD', 'BTC/USD'];

/**
 * Phase 3 (T3): live Agent Arena.
 * LangGraph debate state + MoE consensus arrive via `analysis:result` and are
 * stored in agentStore by socketEventBus.dispatchDeepAnalysis.
 */
export default function AgentsPage() {
  const [activeView, setActiveView] = useState('langgraph');
  const [symbol, setSymbol] = useState('EUR/USD');
  const [running, setRunning] = useState(false);

  const ActiveIcon = VIEWS.find((v) => v.id === activeView)?.icon || Bot;

  const langGraphState = useAgentStore((s) => s.langGraphState);
  const moeConsensus = useAgentStore((s) => s.moeConsensus);
  const activePhase = useAgentStore((s) => s.activePhase);

  // debateState shape for DebateTimeline: lean on live state, never mocks.
  const debateState = langGraphState && Object.keys(langGraphState).length
    ? langGraphState
    : null;

  const runDebate = () => {
    setRunning(true);
    socketEventBus.requestAnalysis(symbol, {
      query: `Run the full LangGraph agent committee debate and MoE consensus for ${symbol}`,
      debate_rounds: 3,
      risk_rounds: 2,
    });
    // analysis:result clears `running` via dispatchDeepAnalysis → phase change.
    // Also watchdog clears it if the engine answers with an error payload.
    socketEventBus.once?.('analysis:result', () => setRunning(false));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'rgba(0, 242, 255, 0.1)', border: '1px solid rgba(0, 242, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={22} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Agent Arena</h1>
            <p className="text-sm text-white/40 font-mono">
              LangGraph committee debate · MoE consensus engine
            </p>
          </div>
        </div>

        {/* Run debate */}
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
          <button className="btn btn-primary" onClick={runDebate} disabled={running}>
            {running ? <><Loader2 size={14} className="animate-spin" /> Debating…</> : <><Play size={13} /> Run Debate</>}
          </button>
        </div>
      </motion.div>

      {/* Phase strip from live engine state */}
      {debateState && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
          <span className="uppercase tracking-wider">Phase:</span>
          <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(0,242,255,0.08)', border: '1px solid rgba(0,242,255,0.2)', color: 'var(--neon-cyan)' }}>
            {activePhase || `phase_${debateState.phase ?? '—'}`}
          </span>
          {typeof debateState.round === 'number' && debateState.maxRounds && (
            <span className="font-mono">round {debateState.round}/{debateState.maxRounds}</span>
          )}
        </div>
      )}

      {/* View Switcher */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', maxWidth: '320px' }}>
        {VIEWS.map((view) => {
          const ViewIcon = view.icon;
          const isActive = activeView === view.id;
          return (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-display font-bold transition-all"
              style={{
                background: isActive ? 'var(--bg-void)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                border: isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <ViewIcon size={16} />
              {view.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <motion.div key={activeView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <AnimatePresence mode="wait">
          {activeView === 'langgraph' ? (
            debateState ? (
              <DebateTimeline debateState={debateState} />
            ) : (
              <NoDebateYet onRun={runDebate} running={running} />
            )
          ) : (
            <MoEEnhanced moeData={moeConsensus} />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function NoDebateYet({ onRun, running }) {
  return (
    <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-default)' }}>
      <LayoutGrid size={36} className="mx-auto mb-4 opacity-40" style={{ color: 'var(--text-tertiary)' }} />
      <p style={{ color: 'var(--text-secondary)' }}>No committee debate has run since the engine connected.</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
        Press <b style={{ color: 'var(--neon-cyan)' }}>Run Debate</b> to launch the LangGraph committee — results land here live.
      </p>
      <button className="btn btn-primary mt-6" onClick={onRun} disabled={running}>
        {running ? <><Loader2 size={14} className="animate-spin" /> Debating…</> : <><Play size={13} /> Run Debate</>}
      </button>
    </div>
  );
}