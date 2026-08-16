'use client';
import { create } from 'zustand';

/**
 * analysisStore — ML model predictions, technical indicators,
 * fundamental context, and RAG context for the analysis pipeline.
 */
const useAnalysisStore = create((set) => ({
  // ── State ──────────────────────────────────────────────────────────

  /** LSTM price prediction output */
  lstmPrediction: {
    direction: 'neutral',
    probability: 0.5,
    targetPrice: null,
    timestamp: null,
    confidence: 0,
    modelVersion: null,
  },

  /** CNN pattern recognition results */
  cnnPatterns: [],

  /** Computed technical indicators */
  technicalIndicators: {
    rsi: 50,
    macd: { value: 0, signal: 0, histogram: 0 },
    bollingerBands: { upper: 0, middle: 0, lower: 0 },
    movingAverages: { ma20: 0, ma50: 0, ma200: 0 },
    supportLevels: [],
    resistanceLevels: [],
    volatility: 0,
    atr: 0,
  },

  /** Fundamental / macro context */
  fundamentalContext: {
    newsSentiment: 'neutral',
    economicIndicators: {},
    centralBankPolicy: '',
    highImpactEvents: [],
  },

  /** RAG context from the knowledge base */
  ragContext: {
    relevantDocs: [],
    summary: '',
    lastUpdated: null,
    query: '',
  },

  // ── Actions ────────────────────────────────────────────────────────

  /** Update LSTM prediction */
  setLSTM: (prediction) =>
    set((state) => ({
      lstmPrediction: {
        ...state.lstmPrediction,
        ...prediction,
        timestamp: prediction.timestamp || new Date().toISOString(),
      },
    })),

  /** Set CNN pattern results (replaces all) */
  setCNN: (patterns) => set({ cnnPatterns: Array.isArray(patterns) ? patterns : [] }),

  /** Add a single CNN pattern detection */
  addCNNPattern: (pattern) =>
    set((state) => ({
      cnnPatterns: [
        ...state.cnnPatterns,
        { id: `cnn-${Date.now()}`, timestamp: new Date().toISOString(), ...pattern },
      ],
    })),

  /** Update technical indicators */
  setTechnical: (indicators) =>
    set((state) => ({
      technicalIndicators: {
        ...state.technicalIndicators,
        ...indicators,
        movingAverages: {
          ...state.technicalIndicators.movingAverages,
          ...(indicators.movingAverages || {}),
        },
        bollingerBands: {
          ...state.technicalIndicators.bollingerBands,
          ...(indicators.bollingerBands || {}),
        },
        macd: {
          ...state.technicalIndicators.macd,
          ...(indicators.macd || {}),
        },
      },
    })),

  /** Update fundamental / macro context */
  setFundamental: (context) =>
    set((state) => ({
      fundamentalContext: {
        ...state.fundamentalContext,
        ...context,
        economicIndicators: {
          ...state.fundamentalContext.economicIndicators,
          ...(context.economicIndicators || {}),
        },
      },
    })),

  /** Update RAG context */
  setRAGContext: (context) =>
    set((state) => ({
      ragContext: {
        ...state.ragContext,
        ...context,
        lastUpdated: new Date().toISOString(),
      },
    })),

  /** Reset all analysis state */
  resetAnalysis: () =>
    set({
      lstmPrediction: {
        direction: 'neutral',
        probability: 0.5,
        targetPrice: null,
        timestamp: null,
        confidence: 0,
        modelVersion: null,
      },
      cnnPatterns: [],
      technicalIndicators: {
        rsi: 50,
        macd: { value: 0, signal: 0, histogram: 0 },
        bollingerBands: { upper: 0, middle: 0, lower: 0 },
        movingAverages: { ma20: 0, ma50: 0, ma200: 0 },
        supportLevels: [],
        resistanceLevels: [],
        volatility: 0,
        atr: 0,
      },
      fundamentalContext: {
        newsSentiment: 'neutral',
        economicIndicators: {},
        centralBankPolicy: '',
        highImpactEvents: [],
      },
      ragContext: {
        relevantDocs: [],
        summary: '',
        lastUpdated: null,
        query: '',
      },
    }),
}));

export default useAnalysisStore;
