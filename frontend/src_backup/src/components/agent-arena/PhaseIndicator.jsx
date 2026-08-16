'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Circle } from 'lucide-react';

const PHASE_LABELS = ['Overview', 'Analysis', 'Debate', 'Synthesis', 'Risk', 'Final'];

const phaseColors = {
  pending: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', text: 'var(--text-muted)', glow: 'none' },
  active: { bg: 'rgba(0, 242, 255, 0.12)', border: 'var(--neon-cyan)', text: 'var(--neon-cyan)', glow: '0 0 12px rgba(0, 242, 255, 0.4)' },
  done: { bg: 'rgba(0, 255, 136, 0.12)', border: 'var(--neon-emerald)', text: 'var(--neon-emerald)', glow: '0 0 8px rgba(0, 255, 136, 0.3)' },
  skipped: { bg: 'rgba(255, 255, 255, 0.02)', border: 'rgba(255,255,255,0.05)', text: 'var(--text-muted)', glow: 'none' },
};

export default function PhaseIndicator({ currentPhase = 0, phaseStates = ['active', 'pending', 'pending', 'pending', 'pending', 'pending'] }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0',
      padding: '20px 16px',
      position: 'relative',
      width: '100%',
    }}>
      {PHASE_LABELS.map((label, index) => {
        const state = phaseStates[index] || 'pending';
        const colors = phaseColors[state];
        const isActive = state === 'active';
        const isDone = state === 'done';
        const isSkipped = state === 'skipped';
        const isLast = index === PHASE_LABELS.length - 1;

        return (
          <React.Fragment key={label}>
            {/* Step Circle + Label */}
            <motion.div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                position: 'relative',
                zIndex: 2,
                cursor: 'default',
                flexShrink: 0,
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.08, duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
            >
              <motion.div
                animate={isActive ? {
                  scale: [1, 1.15, 1],
                  boxShadow: [colors.glow, `0 0 20px ${colors.border}`, colors.glow],
                } : {}}
                transition={isActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: colors.bg,
                  border: `2px solid ${colors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: colors.glow,
                  transition: 'all 0.3s var(--ease-out-expo)',
                  position: 'relative',
                }}
              >
                {isDone ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  >
                    <Check size={16} style={{ color: colors.text }} strokeWidth={3} />
                  </motion.div>
                ) : isSkipped ? (
                  <Circle size={16} style={{ color: colors.text }} />
                ) : (
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: colors.text,
                  }}>
                    {index + 1}
                  </span>
                )}
              </motion.div>

              <span style={{
                fontSize: '0.625rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: isActive || isDone ? 700 : 500,
                color: colors.text,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
                transition: 'color 0.3s',
              }}>
                {label}
              </span>

              {/* Active indicator dot */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: colors.border,
                      boxShadow: `0 0 6px ${colors.border}`,
                    }}
                  />
                )}
              </AnimatePresence>
            </motion.div>

            {/* Connector Line */}
            {!isLast && (
              <div style={{
                flex: 1,
                height: '2px',
                margin: '0 8px',
                marginBottom: '24px',
                borderRadius: '1px',
                background: isDone
                  ? `linear-gradient(90deg, var(--neon-emerald), var(--neon-emerald))`
                  : isActive || phaseStates[index + 1] === 'active'
                    ? `linear-gradient(90deg, ${isDone ? 'var(--neon-emerald)' : 'rgba(255,255,255,0.08)'}, ${phaseStates[index + 1] === 'active' ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.04)'})`
                    : 'rgba(255,255,255,0.04)',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* Animated shimmer on active segment */}
                {isDone && (
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(90deg, transparent, rgba(0,255,136,0.3), transparent)',
                    }}
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  />
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
