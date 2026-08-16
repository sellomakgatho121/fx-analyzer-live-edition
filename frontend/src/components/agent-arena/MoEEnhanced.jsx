'use client';
import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  BookOpen,
  MessageCircle,
  ShieldCheck,
  Brain,
} from 'lucide-react';

const AGENT_CONFIGS = {
  technical: {
    label: 'Technical Expert',
    color: '#00f2ff',
    bg: 'rgba(0, 242, 255, 0.08)',
    border: 'rgba(0, 242, 255, 0.2)',
    Icon: TrendingUp,
  },
  fundamental: {
    label: 'Macro Strategist',
    color: '#00ff88',
    bg: 'rgba(0, 255, 136, 0.08)',
    border: 'rgba(0, 255, 136, 0.2)',
    Icon: BookOpen,
  },
  sentiment: {
    label: 'Market Sentiment',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.08)',
    border: 'rgba(168, 85, 247, 0.2)',
    Icon: MessageCircle,
  },
  risk: {
    label: 'Risk Guardian',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.08)',
    border: 'rgba(249, 115, 22, 0.2)',
    Icon: ShieldCheck,
  },
};

function SignalBadge({ signal }) {
  if (!signal) return null;
  const upper = String(signal).toUpperCase();
  const isBullish = ['BULLISH', 'BULL', 'BUY', 'LONG', 'RISK_ON'].includes(upper);
  const isBearish = ['BEARISH', 'BEAR', 'SELL', 'SHORT'].includes(upper);
  const color = isBullish ? 'var(--neon-emerald)' : isBearish ? 'var(--neon-ruby)' : 'var(--neon-gold)';
  const bg = isBullish ? 'rgba(0,255,136,0.12)' : isBearish ? 'rgba(255,51,102,0.12)' : 'rgba(255,215,0,0.12)';
  const border = isBullish ? 'rgba(0,255,136,0.25)' : isBearish ? 'rgba(255,51,102,0.25)' : 'rgba(255,215,0,0.25)';

  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      background: bg,
      border: `1px solid ${border}`,
      fontSize: '0.625rem',
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      color,
      textTransform: 'uppercase',
    }}>
      {signal}
    </span>
  );
}

function computeConsensus(moeData) {
  if (!moeData) return { signal: 'NEUTRAL', confidence: 0 };

  const agents = ['technical', 'fundamental', 'sentiment', 'risk'];
  let buyCount = 0;
  let sellCount = 0;
  let totalConf = 0;
  let contributorCount = 0;

  agents.forEach((key) => {
    const agent = moeData[key];
    if (!agent) return;
    const signal = String(agent.signal || agent.bias || agent.sentiment || '').toUpperCase();
    const conf = agent.confidence || 0;
    totalConf += conf;
    contributorCount++;

    const isBullish = ['BULLISH', 'BULL', 'BUY', 'LONG', 'RISK_ON'].includes(signal);
    const isBearish = ['BEARISH', 'BEAR', 'SELL', 'SHORT'].includes(signal);

    if (isBullish) buyCount += conf;
    if (isBearish) sellCount += conf;
  });

  if (contributorCount === 0) return { signal: 'NEUTRAL', confidence: 0 };

  const avgConf = totalConf / contributorCount;
  let consensusSignal = 'NEUTRAL';

  if (buyCount > sellCount && buyCount > 0.3) consensusSignal = 'BUY';
  else if (sellCount > buyCount && sellCount > 0.3) consensusSignal = 'SELL';

  return {
    signal: consensusSignal,
    confidence: Math.max(buyCount, sellCount) / (buyCount + sellCount || 1),
    avgConfidence: avgConf,
  };
}

export default function MoEEnhanced({ moeData = null }) {
  if (!moeData) return null;

  const agents = ['technical', 'fundamental', 'sentiment', 'risk'];
  const consensus = computeConsensus(moeData);

  const isBuy = consensus.signal === 'BUY';
  const isSell = consensus.signal === 'SELL';
  const consensusColor = isBuy ? 'var(--neon-emerald)' : isSell ? 'var(--neon-ruby)' : 'var(--neon-gold)';
  const consensusBg = isBuy ? 'rgba(0,255,136,0.1)' : isSell ? 'rgba(255,51,102,0.1)' : 'rgba(255,215,0,0.1)';
  const consensusBorder = isBuy ? 'rgba(0,255,136,0.3)' : isSell ? 'rgba(255,51,102,0.3)' : 'rgba(255,215,0,0.3)';

  const confidencePct = Math.round((consensus.confidence || 0) * 100);

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
        marginBottom: '16px',
        padding: '0 4px',
      }}>
        <div style={{
          width: '3px',
          height: '18px',
          borderRadius: '2px',
          background: 'linear-gradient(180deg, var(--neon-cyan), var(--neon-emerald), var(--neon-violet))',
        }} />
        <h3 style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          MoE Expert Consensus
        </h3>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border-default), transparent)' }} />
      </div>

      {/* 2x2 Agent Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '10px',
        marginBottom: '16px',
      }}>
        {agents.map((key, index) => {
          const config = AGENT_CONFIGS[key];
          const agentData = moeData[key] || {};
          const { Icon } = config;
          const signal = agentData.signal || agentData.bias || agentData.sentiment || 'NEUTRAL';
          const conf = agentData.confidence || 0;
          const confPct = Math.round(conf * 100);

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.35 }}
              whileHover={{ y: -2 }}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                background: config.bg,
                border: `1px solid ${config.border}`,
                transition: 'border-color 0.2s, box-shadow 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${config.color}50`;
                e.currentTarget.style.boxShadow = `0 0 20px ${config.color}15`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = config.border;
                e.currentTarget.style.boxShadow = 'none';
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
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: `${config.color}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${config.color}30`,
                }}>
                  <Icon size={14} color={config.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    display: 'block',
                  }}>
                    {config.label}
                  </span>
                </div>
                <SignalBadge signal={signal} />
              </div>

              {/* Confidence Bar */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '3px',
                }}>
                  <span style={{
                    fontSize: '0.5625rem',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    Confidence
                  </span>
                  <span style={{
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: config.color,
                  }}>
                    {confPct}%
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '3px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${confPct}%` }}
                    transition={{ duration: 1, delay: 0.2 + index * 0.1 }}
                    style={{
                      height: '100%',
                      borderRadius: '2px',
                      background: `linear-gradient(90deg, ${config.color}60, ${config.color})`,
                      boxShadow: `0 0 6px ${config.color}40`,
                    }}
                  />
                </div>
              </div>

              {/* Reasoning snippet */}
              {(agentData.reasoning || agentData.analysis) && (
                <p style={{
                  fontSize: '0.625rem',
                  lineHeight: 1.5,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {agentData.reasoning || agentData.analysis}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Confidence Comparison Bars */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        style={{
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '16px',
        }}
      >
        <span style={{
          fontSize: '0.625rem',
          fontWeight: 600,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          display: 'block',
          marginBottom: '10px',
        }}>
          Agent Confidence Comparison
        </span>
        {agents.map((key, index) => {
          const config = AGENT_CONFIGS[key];
          const agentData = moeData[key] || {};
          const conf = agentData.confidence || 0;
          const confPct = Math.round(conf * 100);

          return (
            <div key={`bar-${key}`} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: index < agents.length - 1 ? '8px' : 0,
            }}>
              <span style={{
                width: '100px',
                fontSize: '0.625rem',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                textAlign: 'right',
                flexShrink: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {config.label}
              </span>
              <div style={{
                flex: 1,
                height: '16px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '3px',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${confPct}%` }}
                  transition={{ duration: 0.8, delay: 0.5 + index * 0.1, ease: 'easeOut' }}
                  style={{
                    height: '100%',
                    borderRadius: '3px',
                    background: `linear-gradient(90deg, ${config.color}50, ${config.color})`,
                    boxShadow: `0 0 8px ${config.color}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: '6px',
                    minWidth: confPct > 10 ? 'auto' : 0,
                  }}
                >
                  {confPct > 15 && (
                    <span style={{
                      fontSize: '0.5625rem',
                      fontWeight: 700,
                      color: '#000',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {confPct}%
                    </span>
                  )}
                </motion.div>
              </div>
              {confPct <= 15 && (
                <span style={{
                  fontSize: '0.5625rem',
                  fontWeight: 700,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  position: 'absolute',
                  right: '8px',
                }}>
                  {confPct}%
                </span>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* Consensus Verdict */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
        style={{
          padding: '20px 24px',
          borderRadius: 'var(--radius-lg)',
          background: consensusBg,
          border: `1px solid ${consensusBorder}`,
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative glow */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: `${consensusColor}10`,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '4px',
          }}>
            <Brain size={16} color={consensusColor} />
            <span style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}>
              Consensus Verdict
            </span>
          </div>

          <div style={{
            fontSize: '2rem',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: consensusColor,
            letterSpacing: '0.04em',
            textShadow: `0 0 30px ${consensusColor}40`,
            marginBottom: '4px',
          }}>
            {consensus.signal}
          </div>

          {(consensus.confidence || consensus.avgConfidence) && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '20px',
              flexWrap: 'wrap',
            }}>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}>
                Consensus Confidence: <strong style={{ color: consensusColor }}>{confidencePct}%</strong>
              </span>
              {consensus.avgConfidence && (
                <span style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  Avg Confidence: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(consensus.avgConfidence * 100)}%</strong>
                </span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
