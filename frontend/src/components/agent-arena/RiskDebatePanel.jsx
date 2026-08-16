'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Shield, Minus, Scale, AlertTriangle, Zap } from 'lucide-react';

const RISK_AGENT_CONFIG = {
  aggressive: {
    label: 'Aggressive Risk Analyst',
    color: '#ff0f42',
    bg: 'rgba(255, 15, 66, 0.08)',
    border: 'rgba(255, 15, 66, 0.25)',
    Icon: Flame,
  },
  safe: {
    label: 'Safe Risk Analyst',
    color: '#00f2ff',
    bg: 'rgba(0, 242, 255, 0.08)',
    border: 'rgba(0, 242, 255, 0.25)',
    Icon: Shield,
  },
  neutral: {
    label: 'Neutral Risk Analyst',
    color: '#ffd700',
    bg: 'rgba(255, 215, 0, 0.08)',
    border: 'rgba(255, 215, 0, 0.25)',
    Icon: Minus,
  },
};

function getRiskConfig(speaker) {
  const key = String(speaker || '').toLowerCase();
  if (key.includes('aggress') || key === 'aggressive') return RISK_AGENT_CONFIG.aggressive;
  if (key.includes('safe') || key === 'safe') return RISK_AGENT_CONFIG.safe;
  if (key.includes('neutral') || key === 'neutral') return RISK_AGENT_CONFIG.neutral;
  // Fallback by index
  return RISK_AGENT_CONFIG.neutral;
}

function RegimeBadge({ regime }) {
  if (!regime) return null;
  const upper = String(regime).toUpperCase();
  const regimeConfig = {
    LOW_VOL: { color: 'var(--neon-emerald)', label: 'Low Volatility' },
    MED_VOL: { color: 'var(--neon-gold)', label: 'Medium Volatility' },
    HIGH_VOL: { color: 'var(--neon-ruby)', label: 'High Volatility' },
    EXTREME: { color: '#ff0f42', label: 'Extreme Volatility' },
    CALM: { color: 'var(--neon-emerald)', label: 'Calm' },
    NORMAL: { color: 'var(--neon-cyan)', label: 'Normal' },
    TURBULENT: { color: 'var(--neon-ruby)', label: 'Turbulent' },
  };
  const config = regimeConfig[upper] || { color: 'var(--text-secondary)', label: regime };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 10px',
      borderRadius: 'var(--radius-full)',
      background: `${config.color}15`,
      border: `1px solid ${config.color}30`,
      fontSize: '0.6875rem',
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      color: config.color,
    }}>
      <AlertTriangle size={10} />
      {config.label}
    </span>
  );
}

export default function RiskDebatePanel({ riskDebate = [], riskDecision = null }) {
  if (!riskDebate || riskDebate.length === 0) return null;

  // Group debate rounds by round number
  const roundsMap = {};
  riskDebate.forEach((entry) => {
    const r = entry.round || 1;
    if (!roundsMap[r]) roundsMap[r] = [];
    roundsMap[r].push(entry);
  });

  const roundNumbers = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);

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
          background: 'linear-gradient(180deg, var(--neon-ruby), var(--neon-gold), var(--neon-cyan))',
        }} />
        <h3 style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          Phase 5 — Risk Management Debate
        </h3>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border-default), transparent)' }} />
        <span style={{
          fontSize: '0.625rem',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          background: 'var(--bg-surface)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
        }}>
          {roundNumbers.length} round{roundNumbers.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Debate Rounds */}
      <AnimatePresence>
        {roundNumbers.map((roundNum, roundIdx) => {
          const entries = roundsMap[roundNum];
          return (
            <motion.div
              key={`round-${roundNum}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: roundIdx * 0.15, duration: 0.4 }}
              style={{ marginBottom: '16px' }}
            >
              {/* Round Label */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px',
              }}>
                <div style={{
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.625rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                }}>
                  Round {roundNum}
                </div>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
              </div>

              {/* 3-column grid for the three risk analysts */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '10px',
              }}>
                {['Aggressive', 'Safe', 'Neutral'].map((speakerType) => {
                  const entry = entries.find(
                    (e) => String(e.speaker || '').toLowerCase().includes(speakerType.toLowerCase())
                  ) || entries.find(
                    (_, idx) => {
                      const typeMap = ['aggressive', 'safe', 'neutral'];
                      return speakerType.toLowerCase() === typeMap[idx];
                    }
                  );

                  const config = getRiskConfig(speakerType);
                  const { Icon } = config;

                  if (!entry) {
                    return (
                      <div key={speakerType} style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-card)',
                        border: '1px dashed var(--border-subtle)',
                        opacity: 0.4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: '6px',
                      }}>
                        <Icon size={16} color={config.color} opacity={0.3} />
                        <span style={{
                          fontSize: '0.6875rem',
                          color: 'var(--text-muted)',
                          fontWeight: 500,
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {config.label}
                        </span>
                        <span style={{
                          fontSize: '0.625rem',
                          color: 'var(--text-muted)',
                        }}>
                          No input
                        </span>
                      </div>
                    );
                  }

                  return (
                    <motion.div
                      key={`${roundNum}-${speakerType}`}
                      whileHover={{ y: -2, borderColor: config.border }}
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-md)',
                        background: config.bg,
                        border: `1px solid ${config.border}`,
                        transition: 'all 0.2s',
                      }}
                    >
                      {/* Agent Header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '10px',
                      }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: `${config.color}20`,
                          border: `1px solid ${config.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Icon size={14} color={config.color} />
                        </div>
                        <span style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          color: config.color,
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>
                          {config.label.replace(' Risk Analyst', '')}
                        </span>
                      </div>

                      {/* Risk Analysis */}
                      <p style={{
                        fontSize: '0.6875rem',
                        lineHeight: 1.6,
                        color: 'var(--text-secondary)',
                        marginBottom: '10px',
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {entry.riskAnalysis || entry.analysis || entry.argument || ''}
                      </p>

                      {/* Max Leverage */}
                      {entry.maxLeverage !== undefined && entry.maxLeverage !== null && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 10px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: 'var(--radius-sm)',
                        }}>
                          <Zap size={10} color={config.color} />
                          <span style={{
                            fontSize: '0.625rem',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-tertiary)',
                          }}>
                            Max Leverage:
                          </span>
                          <span style={{
                            fontSize: '0.6875rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: config.color,
                          }}>
                            {entry.maxLeverage}x
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Risk Manager Final Decision */}
      {riskDecision && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
          style={{
            marginTop: '20px',
            padding: '20px',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(139, 92, 246, 0.03))',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Top glow */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)',
            boxShadow: '0 0 10px rgba(139, 92, 246, 0.3)',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '16px',
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Scale size={16} color="#8b5cf6" />
              </div>
              <div>
                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#8b5cf6',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Risk Manager Verdict
                </span>
              </div>
            </div>

            {/* Regime + Stats */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '12px',
            }}>
              {riskDecision.regime && <RegimeBadge regime={riskDecision.regime} />}

              {riskDecision.maxLeverage !== undefined && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(0, 242, 255, 0.1)',
                  border: '1px solid rgba(0, 242, 255, 0.25)',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--neon-cyan)',
                }}>
                  <Zap size={10} />
                  Max {riskDecision.maxLeverage}x
                </span>
              )}

              {riskDecision.stopLossAdvice && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(255, 215, 0, 0.1)',
                  border: '1px solid rgba(255, 215, 0, 0.25)',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--neon-gold)',
                }}>
                  <Shield size={10} />
                  SL: {riskDecision.stopLossAdvice}
                </span>
              )}
            </div>

            {/* Reasoning */}
            {(riskDecision.reasoning || riskDecision.rationale) && (
              <p style={{
                fontSize: '0.75rem',
                lineHeight: 1.7,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
              }}>
                {riskDecision.reasoning || riskDecision.rationale}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
