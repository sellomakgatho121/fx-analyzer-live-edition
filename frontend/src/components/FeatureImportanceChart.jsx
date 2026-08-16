'use client';
import React from 'react';
import { motion } from 'framer-motion';

const FEATURE_LABELS = {
  ret_1: 'Ret 1D',
  ret_5: 'Ret 5D',
  vol_ratio: 'Vol Ratio',
  rsi: 'RSI',
  bb_pct: 'BB %',
  atr: 'ATR',
};

export default function FeatureImportanceChart({ features = {}, animate = true }) {
  const entries = Object.entries(features);
  if (entries.length === 0) return null;

  const maxVal = Math.max(...entries.map(([, v]) => v), 0.01);

  const getBarColor = (value) => {
    const ratio = value / maxVal;
    // Gradient from cyan (0) to purple (1)
    const r = Math.round(0 + ratio * 168);
    const g = Math.round(242 - ratio * 194);
    const b = Math.round(255 - ratio * 108);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--neon-cyan)',
            boxShadow: '0 0 8px var(--neon-cyan)',
          }}
        />
        <span
          className="text-caption"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
        >
          Feature Importance
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([key, value], index) => {
          const pct = (value * 100).toFixed(1);
          const barWidth = (value / maxVal) * 100;
          const color = getBarColor(value);

          return (
            <div key={key}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {FEATURE_LABELS[key] || key}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {pct}%
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 6,
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-full)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={animate ? { width: 0 } : { width: `${barWidth}%` }}
                  animate={{ width: `${barWidth}%` }}
                  transition={{
                    duration: 0.8,
                    delay: index * 0.08,
                    ease: [0.19, 1, 0.22, 1],
                  }}
                  style={{
                    height: '100%',
                    background: color,
                    borderRadius: 'var(--radius-full)',
                    boxShadow: `0 0 6px ${color}60`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                      animation: animate ? 'shimmer 2s ease-in-out infinite' : 'none',
                    }}
                  />
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
