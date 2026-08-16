'use client';
import React from 'react';
import { motion } from 'framer-motion';

const ALL_PATTERNS = [
  { id: 'head_and_shoulders', label: 'Head & Shoulders' },
  { id: 'inverse_head_and_shoulders', label: 'Inv. Head & Shoulders' },
  { id: 'double_top', label: 'Double Top' },
  { id: 'double_bottom', label: 'Double Bottom' },
  { id: 'ascending_triangle', label: 'Asc. Triangle' },
  { id: 'descending_triangle', label: 'Desc. Triangle' },
  { id: 'bull_flag', label: 'Bull Flag' },
  { id: 'bear_flag', label: 'Bear Flag' },
  { id: 'wedge', label: 'Wedge' },
];

const PATTERN_ICONS = {
  head_and_shoulders: '⛰',
  inverse_head_and_shoulders: '🏔',
  double_top: '⛰⛰',
  double_bottom: '🏔🏔',
  ascending_triangle: '▲',
  descending_triangle: '▼',
  bull_flag: '⚑',
  bear_flag: '⚐',
  wedge: '◇',
};

export default function PatternProbabilityChart({
  detectedPattern = '',
  confidence = 0,
  patternConfidences = {},
  animate = true,
}) {
  // Build confidence map: use provided confidences, else distribute remaining
  // confidence across patterns with detected pattern getting the main share
  const hasConfidenceMap = Object.keys(patternConfidences).length > 0;

  const getBarData = () => {
    if (hasConfidenceMap) {
      return ALL_PATTERNS.map((p) => ({
        ...p,
        confidence: patternConfidences[p.id] ?? 0,
        isDetected: p.id === detectedPattern,
      }));
    }

    // Evenly distribute remaining (1 - confidence) among the other 8 patterns
    const otherConfidence = (1 - confidence) / 8;
    return ALL_PATTERNS.map((p) => ({
      ...p,
      confidence: p.id === detectedPattern ? confidence : otherConfidence,
      isDetected: p.id === detectedPattern,
    }));
  };

  const bars = getBarData();
  const maxBarVal = Math.max(...bars.map((b) => b.confidence), 0.01);

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
            background: 'var(--neon-gold)',
            boxShadow: '0 0 8px var(--neon-gold)',
          }}
        />
        <span
          className="text-caption"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.08em' }}
        >
          Pattern Probability
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bars.map((bar, index) => {
          const barPct = (bar.confidence * 100).toFixed(1);
          const barWidth = (bar.confidence / maxBarVal) * 100;
          const isDetected = bar.isDetected;

          return (
            <div key={bar.id}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 3,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: '0.625rem', opacity: 0.5 }}>
                    {PATTERN_ICONS[bar.id] || '▫'}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.625rem',
                      fontWeight: isDetected ? 700 : 500,
                      color: isDetected
                        ? 'var(--neon-gold)'
                        : 'var(--text-secondary)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {bar.label}
                  </span>
                  {isDetected && (
                    <span
                      style={{
                        fontSize: '0.5rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255, 215, 0, 0.15)',
                        color: 'var(--neon-gold)',
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    color: isDetected ? 'var(--neon-gold)' : 'var(--text-tertiary)',
                  }}
                >
                  {barPct}%
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 4,
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-full)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={animate ? { width: 0 } : { width: `${barWidth}%` }}
                  animate={{ width: `${barWidth}%` }}
                  transition={{
                    duration: 0.7,
                    delay: index * 0.04,
                    ease: [0.19, 1, 0.22, 1],
                  }}
                  style={{
                    height: '100%',
                    borderRadius: 'var(--radius-full)',
                    background: isDetected
                      ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                      : 'var(--text-muted)',
                    boxShadow: isDetected ? '0 0 8px rgba(245, 158, 11, 0.4)' : 'none',
                    opacity: isDetected ? 1 : 0.4,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
