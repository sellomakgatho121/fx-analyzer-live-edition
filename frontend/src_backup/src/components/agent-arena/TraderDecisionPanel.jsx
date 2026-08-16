'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, DollarSign, Target, Zap } from 'lucide-react';

const DECISION_STYLES = {
  BUY: {
    color: 'var(--neon-emerald)',
    bg: 'rgba(0, 255, 136, 0.1)',
    border: 'rgba(0, 255, 136, 0.3)',
    gradient: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,255,136,0.05))',
    Icon: TrendingUp,
    label: 'BUY',
  },
  SELL: {
    color: 'var(--neon-ruby)',
    bg: 'rgba(255, 51, 102, 0.1)',
    border: 'rgba(255, 51, 102, 0.3)',
    gradient: 'linear-gradient(135deg, rgba(255,51,102,0.15), rgba(255,51,102,0.05))',
    Icon: TrendingDown,
    label: 'SELL',
  },
  HOLD: {
    color: 'var(--neon-gold)',
    bg: 'rgba(255, 215, 0, 0.1)',
    border: 'rgba(255, 215, 0, 0.3)',
    gradient: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))',
    Icon: Minus,
    label: 'HOLD',
  },
};

export default function TraderDecisionPanel({ decision }) {
  if (!decision) return null;

  const action = (decision.action || '').toUpperCase();
  const style = DECISION_STYLES[action] || DECISION_STYLES.HOLD;
  const { Icon } = style;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
      style={{ width: '100%' }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '16px',
        padding: '0 4px',
      }}>
        <div style={{
          width: '3px',
          height: '18px',
          borderRadius: '2px',
          background: 'linear-gradient(180deg, var(--neon-cyan), var(--acid-lime))',
        }} />
        <h3 style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          Phase 4 — Trader Execution
        </h3>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border-default), transparent)' }} />
      </div>

      {/* Main Decision Card */}
      <motion.div
        whileHover={{ y: -2 }}
        style={{
          background: style.gradient,
          border: `1px solid ${style.border}`,
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow Edge */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: `linear-gradient(90deg, transparent, ${style.color}, transparent)`,
          boxShadow: `0 0 12px ${style.color}`,
        }} />

        {/* Decorative corner glow */}
        <div style={{
          position: 'absolute',
          top: '-60px',
          right: '-60px',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: `${style.color}10`,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Top Row: Action Badge + Symbol */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}>
            {/* Big Action Badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.2 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 20px 8px 16px',
                borderRadius: 'var(--radius-full)',
                background: style.bg,
                border: `1px solid ${style.border}`,
              }}
            >
              <motion.div
                animate={action !== 'HOLD' ? { rotate: [0, -10, 10, -5, 0] } : {}}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                <Icon size={24} color={style.color} />
              </motion.div>
              <span style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: style.color,
                letterSpacing: '0.02em',
                textShadow: `0 0 20px ${style.color}40`,
              }}>
                {style.label}
              </span>
            </motion.div>

            {/* Symbol */}
            {decision.symbol && (
              <div style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}>
                {decision.symbol}
              </div>
            )}
          </div>

          {/* Info Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '20px',
          }}>
            {/* Lot Size */}
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px',
              }}>
                <DollarSign size={12} style={{ color: 'var(--text-tertiary)' }} />
                <span style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  Lot Size
                </span>
              </div>
              <span style={{
                fontSize: '1.125rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
              }}>
                {decision.lotSize || '—'}
              </span>
            </div>

            {/* Confidence */}
            {decision.confidence !== undefined && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px',
                }}>
                  <Target size={12} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{
                    fontSize: '0.625rem',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    Confidence
                  </span>
                </div>
                <span style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: style.color,
                }}>
                  {Math.round(decision.confidence * 100)}%
                </span>
              </div>
            )}

            {/* Take Profit if available */}
            {decision.takeProfit && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px',
                }}>
                  <Zap size={12} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{
                    fontSize: '0.625rem',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    Take Profit
                  </span>
                </div>
                <span style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                }}>
                  {decision.takeProfit}
                </span>
              </div>
            )}

            {/* Stop Loss if available */}
            {decision.stopLoss && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '4px',
                }}>
                  <Target size={12} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{
                    fontSize: '0.625rem',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    Stop Loss
                  </span>
                </div>
                <span style={{
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--neon-ruby)',
                }}>
                  {decision.stopLoss}
                </span>
              </div>
            )}
          </div>

          {/* Reasoning */}
          {decision.reasoning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              style={{
                padding: '16px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{
                fontSize: '0.625rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                display: 'block',
                marginBottom: '8px',
              }}>
                Trader Reasoning
              </span>
              <p style={{
                fontSize: '0.8125rem',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
              }}>
                {decision.reasoning}
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
