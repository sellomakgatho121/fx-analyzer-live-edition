'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Swords } from 'lucide-react';

export default function BullBearDebate({ debateRounds = [], maxRounds = 3 }) {
  if (!debateRounds || debateRounds.length === 0) return null;

  const currentRound = debateRounds.length > 0
    ? Math.max(...debateRounds.map((r) => r.round || 1))
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ width: '100%' }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '20px',
        padding: '0 4px',
      }}>
        <div style={{
          width: '3px',
          height: '18px',
          borderRadius: '2px',
          background: 'linear-gradient(180deg, var(--neon-emerald), var(--neon-ruby))',
        }} />
        <h3 style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          Phase 2 — Bull vs Bear Debate
        </h3>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border-default), transparent)' }} />

        {/* Round Counter */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--bg-surface)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-subtle)',
        }}>
          <Swords size={12} style={{ color: 'var(--text-tertiary)' }} />
          <span style={{
            fontSize: '0.625rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}>
            Round {currentRound}/{maxRounds}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', paddingLeft: '20px' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute',
          left: '23px',
          top: 0,
          bottom: 0,
          width: '2px',
          background: 'linear-gradient(180deg, var(--neon-emerald) 0%, var(--neon-ruby) 50%, var(--neon-emerald) 100%)',
          opacity: 0.3,
        }} />

        <AnimatePresence mode="popLayout">
          {debateRounds.map((round, index) => {
            const isBull = String(round.speaker || '').toLowerCase() === 'bull';
            const isBear = String(round.speaker || '').toLowerCase() === 'bear';
            const speakerLabel = isBull ? 'Bull Researcher' : isBear ? 'Bear Researcher' : round.speaker || 'Unknown';
            const bgColor = isBull ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255, 51, 102, 0.06)';
            const borderColor = isBull ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255, 51, 102, 0.25)';
            const accentColor = isBull ? 'var(--neon-emerald)' : 'var(--neon-ruby)';
            const Icon = isBull ? TrendingUp : TrendingDown;

            return (
              <motion.div
                key={`debate-${index}`}
                initial={{ opacity: 0, x: isBull ? -20 : 20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: isBull ? -20 : 20, height: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.19, 1, 0.22, 1],
                  delay: 0.1,
                }}
                style={{
                  display: 'flex',
                  flexDirection: isBull ? 'row' : 'row-reverse',
                  alignItems: 'flex-start',
                  gap: '12px',
                  marginBottom: '16px',
                  position: 'relative',
                }}
              >
                {/* Speaker Dot on timeline */}
                <div style={{
                  position: 'absolute',
                  left: isBull ? '-13px' : 'auto',
                  right: isBear ? '-13px' : 'auto',
                  top: '16px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: accentColor,
                  boxShadow: `0 0 8px ${accentColor}40`,
                  border: '2px solid var(--bg-void)',
                  zIndex: 2,
                }} />

                {/* Spacer for opposite side */}
                <div style={{ flex: isBull ? 0 : 1, minWidth: isBull ? 0 : '40px' }} />

                {/* Debate Bubble */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  style={{
                    flex: 1,
                    maxWidth: 'calc(100% - 80px)',
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '14px 16px',
                    position: 'relative',
                  }}
                >
                  {/* Speaker Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                  }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: `${accentColor}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Icon size={14} color={accentColor} />
                    </div>
                    <div>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: accentColor,
                        fontFamily: 'var(--font-mono)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {speakerLabel}
                      </span>
                      <span style={{
                        fontSize: '0.625rem',
                        color: 'var(--text-tertiary)',
                        marginLeft: '8px',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        Round {round.round || index + 1}
                      </span>
                    </div>
                  </div>

                  {/* Argument */}
                  <p style={{
                    fontSize: '0.75rem',
                    lineHeight: 1.7,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {round.argument || round.analysis || ''}
                  </p>

                  {/* Corner accent */}
                  <div style={{
                    position: 'absolute',
                    top: '-1px',
                    [isBull ? 'left' : 'right']: '-1px',
                    width: '40px',
                    height: '40px',
                    background: `linear-gradient(135deg, ${accentColor}15, transparent)`,
                    borderRadius: isBull
                      ? '0 var(--radius-lg) 0 0'
                      : 'var(--radius-lg) 0 0 0',
                    pointerEvents: 'none',
                  }} />
                </motion.div>

                {/* Spacer for opposite side */}
                <div style={{ flex: isBull ? 1 : 0, minWidth: isBear ? 0 : '40px' }} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
