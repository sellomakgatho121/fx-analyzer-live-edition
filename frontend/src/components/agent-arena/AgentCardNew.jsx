'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

const SIGNAL_COLORS = {
  BULLISH: { text: 'var(--neon-emerald)', bg: 'rgba(0, 255, 136, 0.12)', border: 'rgba(0, 255, 136, 0.3)' },
  BULL: { text: 'var(--neon-emerald)', bg: 'rgba(0, 255, 136, 0.12)', border: 'rgba(0, 255, 136, 0.3)' },
  BUY: { text: 'var(--neon-emerald)', bg: 'rgba(0, 255, 136, 0.12)', border: 'rgba(0, 255, 136, 0.3)' },
  RISK_ON: { text: 'var(--neon-emerald)', bg: 'rgba(0, 255, 136, 0.12)', border: 'rgba(0, 255, 136, 0.3)' },
  BEARISH: { text: 'var(--neon-ruby)', bg: 'rgba(255, 51, 102, 0.12)', border: 'rgba(255, 51, 102, 0.3)' },
  BEAR: { text: 'var(--neon-ruby)', bg: 'rgba(255, 51, 102, 0.12)', border: 'rgba(255, 51, 102, 0.3)' },
  SELL: { text: 'var(--neon-ruby)', bg: 'rgba(255, 51, 102, 0.12)', border: 'rgba(255, 51, 102, 0.3)' },
  NEUTRAL: { text: 'var(--neon-gold)', bg: 'rgba(255, 215, 0, 0.12)', border: 'rgba(255, 215, 0, 0.3)' },
  HOLD: { text: 'var(--neon-gold)', bg: 'rgba(255, 215, 0, 0.12)', border: 'rgba(255, 215, 0, 0.3)' },
};

function getSignalStyle(signal) {
  if (!signal) return SIGNAL_COLORS.NEUTRAL;
  const upper = String(signal).toUpperCase();
  return SIGNAL_COLORS[upper] || SIGNAL_COLORS.NEUTRAL;
}

export default function AgentCardNew({
  title = '',
  analysis = '',
  signal = 'NEUTRAL',
  confidence = 0,
  color = '#00f2ff',
  icon: Icon = null,
}) {
  const [expanded, setExpanded] = useState(false);
  const signalStyle = getSignalStyle(signal);
  const confidencePct = Math.min(100, Math.max(0, Math.round((confidence || 0) * 100)));
  const isLong = analysis && analysis.length > 180;

  const rgb = hexToRgb(color);
  const rgba = (alpha) => rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : color;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
      whileHover={{ y: -2 }}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${rgba(0.2)}`,
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 0 20px ${rgba(0.05)}, 0 4px 20px rgba(0,0,0,0.3)`,
        transition: 'border-color 0.3s, box-shadow 0.3s',
        cursor: isLong ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        if (!isLong) return;
        e.currentTarget.style.borderColor = rgba(0.4);
        e.currentTarget.style.boxShadow = `0 0 30px ${rgba(0.15)}, 0 4px 20px rgba(0,0,0,0.3)`;
      }}
      onMouseLeave={(e) => {
        if (!isLong) return;
        e.currentTarget.style.borderColor = rgba(0.2);
        e.currentTarget.style.boxShadow = `0 0 20px ${rgba(0.05)}, 0 4px 20px rgba(0,0,0,0.3)`;
      }}
      onClick={() => isLong && setExpanded(!expanded)}
    >
      {/* Glow edge */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: 0.6,
      }} />

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
      }}>
        {/* Icon Circle */}
        {Icon && (
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: rgba(0.15),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: `1px solid ${rgba(0.2)}`,
          }}>
            <Icon size={16} color={color} />
          </div>
        )}

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {title}
          </span>
        </div>

        {/* Signal Badge */}
        <div style={{
          padding: '3px 10px',
          borderRadius: 'var(--radius-full)',
          background: signalStyle.bg,
          border: `1px solid ${signalStyle.border}`,
          fontSize: '0.625rem',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: signalStyle.text,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {signal}
        </div>
      </div>

      {/* Analysis Text */}
      {analysis && (
        <div style={{ marginBottom: '10px' }}>
          <p style={{
            fontSize: '0.75rem',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 3,
            WebkitBoxOrient: 'vertical',
          }}>
            {analysis}
          </p>
          {isLong && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              style={{
                background: 'none',
                border: 'none',
                color: color,
                fontSize: '0.625rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 0 0 0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                opacity: 0.7,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
            >
              {expanded ? 'Show less' : 'Show more'}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      )}

      {/* Confidence Bar */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px',
        }}>
          <span style={{
            fontSize: '0.625rem',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Confidence
          </span>
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: color,
          }}>
            {confidencePct}%
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '4px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${confidencePct}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            style={{
              height: '100%',
              borderRadius: '2px',
              background: `linear-gradient(90deg, ${rgba(0.5)}, ${color})`,
              boxShadow: `0 0 8px ${rgba(0.4)}`,
            }}
          />
        </div>
      </div>

      {/* Expanded Content Animation */}
      <AnimatePresence>
        {expanded && isLong && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden', marginTop: '12px' }}
          >
            <div style={{
              padding: '12px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
            }}>
              {analysis}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function hexToRgb(hex) {
  if (!hex) return null;
  const shorthand = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(shorthand);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}
