'use client';
import { create } from 'zustand';
import { CURRENCY_PAIRS } from '@/data/currencyPairs';

/**
 * uiStore — Sidebar state, theme, selected pair, favorites, timeframes
 */
const useUIStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────
  sidebarOpen: true,
  theme: 'dark',
  activePair: CURRENCY_PAIRS[0], // Default EUR/USD
  favoritePairs: ['EURUSD', 'GBPUSD', 'USDJPY'],
  selectedTimeframe: '1h',
  activeView: 'dashboard', // dashboard | analysis | arena | trading | portfolio | research | settings

  // ── Computed (via selector helpers) ────────────────────────────────

  // ── Actions ────────────────────────────────────────────────────────
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setTheme: (theme) => set({ theme }),

  setPair: (pair) => set({ activePair: pair }),

  toggleFavorite: (symbol) =>
    set((state) => {
      const exists = state.favoritePairs.includes(symbol);
      return {
        favoritePairs: exists
          ? state.favoritePairs.filter((s) => s !== symbol)
          : [...state.favoritePairs, symbol],
      };
    }),

  setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),

  setActiveView: (view) => set({ activeView: view }),

  /** Reset UI state */
  resetUI: () =>
    set({
      sidebarOpen: true,
      activePair: CURRENCY_PAIRS[0],
      selectedTimeframe: '1h',
      activeView: 'dashboard',
    }),
}));

export default useUIStore;
