'use client';
import { create } from 'zustand';

/**
 * agentStore — MoE consensus results, LangGraph state, debate history,
 * and the currently active agent / phase of the trading pipeline.
 */
const useAgentStore = create((set) => ({
  // ── State ──────────────────────────────────────────────────────────

  /** MoE consensus output with per-agent scores */
  moeConsensus: {
    technical: { score: 0, signal: 'neutral', confidence: 0 },
    fundamental: { score: 0, signal: 'neutral', confidence: 0 },
    sentiment: { score: 0, signal: 'neutral', confidence: 0 },
    risk: { score: 0, signal: 'neutral', confidence: 0 },
    lstm: { score: 0, signal: 'neutral', confidence: 0 },
    cnn: { score: 0, signal: 'neutral', confidence: 0 },
    aggregate: { score: 0, signal: 'neutral', confidence: 0, verdict: 'HOLD' },
  },

  /** LangGraph pipeline state */
  langGraphState: {
    step: 'idle', // 'data_collection' | 'analysis' | 'debate' | 'consensus' | 'execution' | 'idle'
    progress: 0,
    startedAt: null,
    completedAt: null,
    error: null,
  },

  /** Full debate rounds array */
  debateHistory: [],

  /** The currently running phase label (for UI) */
  activePhase: 'idle',

  /** Which agent is currently "speaking" */
  activeAgent: null,

  // ── Actions ────────────────────────────────────────────────────────

  /** Update the full MoE consensus object */
  updateMoEResult: (result) =>
    set((state) => ({
      moeConsensus: {
        ...state.moeConsensus,
        ...result,
        aggregate: {
          ...state.moeConsensus.aggregate,
          ...(result.aggregate || {}),
        },
      },
    })),

  /** Update a single agent's score in the consensus */
  updateAgentScore: (agentKey, data) =>
    set((state) => ({
      moeConsensus: {
        ...state.moeConsensus,
        [agentKey]: {
          ...state.moeConsensus[agentKey],
          ...data,
        },
      },
    })),

  /** Append a new debate round */
  addDebateRound: (round) =>
    set((state) => ({
      debateHistory: [
        ...state.debateHistory,
        {
          round: state.debateHistory.length + 1,
          timestamp: new Date().toISOString(),
          ...round,
        },
      ],
    })),

  /** Update the most recent debate round (e.g. agent appends reasoning) */
  updateDebateRound: (data) =>
    set((state) => {
      const history = [...state.debateHistory];
      if (history.length === 0) {
        history.push({ round: 1, timestamp: new Date().toISOString(), ...data });
      } else {
        history[history.length - 1] = {
          ...history[history.length - 1],
          ...data,
        };
      }
      return { debateHistory: history };
    }),

  /** Clear debate history */
  clearDebateHistory: () => set({ debateHistory: [] }),

  /** Set the active pipeline phase */
  setActivePhase: (phase) => set({ activePhase: phase }),

  /** Set which agent is currently active */
  setActiveAgent: (agent) => set({ activeAgent: agent }),

  /** Update the LangGraph pipeline state */
  setLangGraphState: (stateUpdate) =>
    set((state) => ({
      langGraphState: {
        ...state.langGraphState,
        ...stateUpdate,
      },
    })),

  /** Reset all agent state */
  resetAgent: () =>
    set({
      moeConsensus: {
        technical: { score: 0, signal: 'neutral', confidence: 0 },
        fundamental: { score: 0, signal: 'neutral', confidence: 0 },
        sentiment: { score: 0, signal: 'neutral', confidence: 0 },
        risk: { score: 0, signal: 'neutral', confidence: 0 },
        lstm: { score: 0, signal: 'neutral', confidence: 0 },
        cnn: { score: 0, signal: 'neutral', confidence: 0 },
        aggregate: { score: 0, signal: 'neutral', confidence: 0, verdict: 'HOLD' },
      },
      langGraphState: {
        step: 'idle',
        progress: 0,
        startedAt: null,
        completedAt: null,
        error: null,
      },
      debateHistory: [],
      activePhase: 'idle',
      activeAgent: null,
    }),
}));

export default useAgentStore;
