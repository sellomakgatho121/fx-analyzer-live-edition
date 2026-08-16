'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const PATTERN_DISPLAY_NAMES = {
  head_and_shoulders: 'Head & Shoulders',
  inverse_head_and_shoulders: 'Inverse Head & Shoulders',
  double_top: 'Double Top',
  double_bottom: 'Double Bottom',
  ascending_triangle: 'Ascending Triangle',
  descending_triangle: 'Descending Triangle',
  bull_flag: 'Bull Flag',
  bear_flag: 'Bear Flag',
  wedge: 'Wedge',
};

const PATTERN_EMOJIS = {
  head_and_shoulders: '⛰️',
  inverse_head_and_shoulders: '🏔️',
  double_top: '🔝',
  double_bottom: '🔽',
  ascending_triangle: '📈',
  descending_triangle: '📉',
  bull_flag: '🚩',
  bear_flag: '🏳️',
  wedge: '◆',
};

export default function PatternDisplayCard({ pattern = '', confidence = 0, signal = 'neutral', rulePatterns = [] }) {
  const signalInfo = getSignalInfo(signal);
  const displayName = PATTERN_DISPLAY_NAMES[pattern] || pattern.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const emoji = PATTERN_EMOJIS[pattern] || '📊';
  const confidencePercent = Math.round(confidence * 100);

  // Gauge arc: 0-180 degrees (bottom half circle)
  const gaugeAngle = confidence * 180; // 0 to 180
  const gaugeRad = (gaugeAngle * Math.PI) / 180;
  const gaugeX = 50 + 40 * Math.sin(gaugeRad);
  const gaugeY = 50 - 40 * Math.cos(gaugeRad);
  const largeArc = confidence > 0.5 ? 1 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Subtle top accent line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: signalInfo.color,
          opacity: 0.6,
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--radius-md)',
              background: `${signalInfo.color}12`,
              border: `1px solid ${signalInfo.color}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
            }}
          >
            {signalInfo.icon}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  lineHeight: 1.2,
                }}
              >
                {displayName}
              </h3>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  background: `${signalInfo.color}18`,
                  color: signalInfo.color,
                  border: `1px solid ${signalInfo.color}30`,
                }}
              >
                {signalInfo.label}
              </span>
            </div>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6875rem',
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {emoji} Detected Pattern
            </p>
          </div>
        </div>

        {/* Confidence Badge */}
        <div
          style={{
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.5rem',
              fontWeight: 800,
              color: signalInfo.color,
              textShadow: `0 0 20px ${signalInfo.color}40`,
              lineHeight: 1,
            }}
          >
            {confidencePercent}%
          </span>
          <span
            style={{
              fontSize: '0.6rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Confidence
          </span>
        </div>
      </div>

      {/* Gauge Visualization */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 'var(--space-lg)',
        }}
      >
        <svg width="120" height="70" viewBox="0 0 100 60" style={{ overflow: 'visible' }}>
          {/* Background arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {/* Confidence arc */}
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: confidence }}
            transition={{ duration: 1.2, ease: [0.19, 1, 0.22, 1] }}
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={signalInfo.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${confidence * 251.2} 251.2`}
            style={{ filter: `drop-shadow(0 0 4px ${signalInfo.color}60)` }}
          />
          {/* Needle */}
          <motion.line
            initial={{ rotate: -90 }}
            animate={{ rotate: -90 + gaugeAngle }}
            transition={{ duration: 1, ease: [0.19, 1, 0.22, 1], delay: 0.3 }}
            x1="50"
            y1="50"
            x2={50 + 35 * Math.sin((gaugeAngle * Math.PI) / 180)}
            y2={50 - 35 * Math.cos((gaugeAngle * Math.PI) / 180)}
            stroke={signalInfo.color}
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{ transformOrigin: '50px 50px', filter: `drop-shadow(0 0 3px ${signalInfo.color}80)` }}
          />
          {/* Center dot */}
          <circle cx="50" cy="50" r="3" fill={signalInfo.color} />
          <circle cx="50" cy="50" r="1.5" fill="var(--bg-void)" />
        </svg>
      </div>

      {/* Rule-based Confirmations */}
      {rulePatterns && rulePatterns.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.625rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-tertiary)',
              }}
            >
              Rule-Based Confirmations
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {rulePatterns.map((rp, idx) => {
              const ruleConf = Math.round((rp.confidence || 0) * 100);
              return (
                <motion.div
                  key={rp.name || idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + idx * 0.1 }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.625rem',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        ruleConf >= 50
                          ? 'var(--neon-emerald)'
                          : ruleConf >= 25
                            ? 'var(--neon-gold)'
                            : 'var(--text-muted)',
                      boxShadow:
                        ruleConf >= 50
                          ? '0 0 6px var(--neon-emerald)'
                          : 'none',
                    }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {rp.name?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    {ruleConf}%
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function getSignalInfo(signal) {
  const s = (signal || 'neutral').toLowerCase();
  if (s === 'bullish' || s === 'buy') {
    return {
      label: 'BULLISH',
      color: 'var(--neon-emerald)',
      icon: <TrendingUp size={20} style={{ color: 'var(--neon-emerald)' }} />,
    };
  }
  if (s === 'bearish' || s === 'sell') {
    return {
      label: 'BEARISH',
      color: 'var(--neon-ruby)',
      icon: <TrendingDown size={20} style={{ color: 'var(--neon-ruby)' }} />,
    };
  }
  return {
    label: 'NEUTRAL',
    color: 'var(--text-tertiary)',
    icon: <Minus size={20} style={{ color: 'var(--text-tertiary)' }} />,
  };
}
