/**
 * theme.js — Design token constants for the FX Analyzer Pro dark neon theme.
 *
 * These mirror the CSS custom properties defined in globals.css and provide
 * a JavaScript reference for inline styles, chart themes, and dynamic computations.
 */

export const COLORS = {
  // Core backgrounds
  bgVoid: '#030305',
  bgDeep: '#050507',
  bgSurface: '#0a0a0d',
  bgElevated: '#12121a',
  bgCard: '#0d0d12',

  // Neon accent colors
  acidLime: '#ccff00',
  hyperRed: '#ff0f42',
  electricViolet: '#7d00ff',

  // Legacy neon colors
  neonEmerald: '#00ff88',
  neonEmeraldDim: '#00cc6a',
  neonRuby: '#ff3366',
  neonRubyDim: '#cc2952',
  neonCyan: '#00f2ff',
  neonCyanDim: '#00bfcc',
  neonGold: '#ffd700',
  neonViolet: '#a855f7',

  // Agent-specific colors
  agentTechnical: '#00f2ff',
  agentFundamental: '#00ff88',
  agentSentiment: '#a855f7',
  agentRisk: '#f97316',
  agentLSTM: '#ff6b9d',
  agentCNN: '#fbbf24',
  agentBull: '#00ff88',
  agentBear: '#ff0f42',

  // Text colors
  textPrimary: '#ffffff',
  textSecondary: '#8b8b9a',
  textTertiary: '#5a5a6a',
  textMuted: '#3a3a4a',

  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.04)',
  borderDefault: 'rgba(255, 255, 255, 0.08)',
  borderHover: 'rgba(255, 255, 255, 0.12)',
  borderFocus: 'rgba(0, 242, 255, 0.4)',
};

export const GRADIENTS = {
  emerald: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
  ruby: 'linear-gradient(135deg, #ff3366 0%, #cc2952 100%)',
  cyan: 'linear-gradient(135deg, #00f2ff 0%, #00bfcc 100%)',
  premium: 'linear-gradient(135deg, #00f2ff 0%, #00ff88 50%, #a855f7 100%)',
  dark: 'linear-gradient(180deg, #0a0a0d 0%, #030305 100%)',
  sidebar: 'linear-gradient(180deg, #0a0a0f 0%, #050508 100%)',
};

export const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
};

export const RADIUS = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  xl: '24px',
  full: '9999px',
};

export const FONTS = {
  display: "'Outfit', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export const TIMEFRAMES = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
];

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

export const AGENT_LABELS = {
  technical: 'Technical Analysis',
  fundamental: 'Fundamental Analysis',
  sentiment: 'Sentiment Analysis',
  risk: 'Risk Management',
  lstm: 'LSTM Price Prediction',
  cnn: 'CNN Pattern Recognition',
};
