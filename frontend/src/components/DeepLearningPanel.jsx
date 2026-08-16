'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Activity, TrendingUp, TrendingDown, BarChart3, ChevronRight, Zap, Radio } from 'lucide-react';
import FeatureImportanceChart from './FeatureImportanceChart';
import PatternProbabilityChart from './PatternProbabilityChart';
import PatternDisplayCard from './PatternDisplayCard';

const TABS = [
  { id: 'lstm', label: 'LSTM Prediction', icon: Brain, accentVar: '--agent-lstm' },
  { id: 'cnn', label: 'Chart Patterns', icon: Activity, accentVar: '--agent-cnn' },
];

export default function DeepLearningPanel({ lstmData = null, cnnData = null }) {
  const [activeTab, setActiveTab] = useState('lstm');

  const lstmSignal = (lstmData?.signal || 'neutral').toLowerCase();
  const lstmSignalInfo = getLstmSignalInfo(lstmSignal);
  const lstmConfidence = lstmData?.confidence ?? 0;
  const lstmConfPct = Math.round(lstmConfidence * 100);
  const isTrained = lstmData?.report?.includes('Trained') ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-md) var(--space-lg)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <Brain size={16} style={{ color: 'var(--text-secondary)' }} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-primary)',
            }}
          >
            Deep Learning Suite
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.5625rem',
            color: 'var(--text-tertiary)',
          }}
        >
          <Radio size={10} />
          <span>v2.0 · DL Engine</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-deep)',
        }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px var(--space-md)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: '0.6875rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom: isActive ? `2px solid var(${tab.accentVar}, ${tab.id === 'lstm' ? '#ff6b9d' : '#fbbf24'})` : '2px solid transparent',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
            >
              <Icon
                size={14}
                style={{
                  color: isActive
                    ? `var(${tab.accentVar}, ${tab.id === 'lstm' ? '#ff6b9d' : '#fbbf24'})`
                    : 'var(--text-tertiary)',
                }}
              />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ padding: 'var(--space-lg)' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'lstm' && (
            <motion.div
              key="lstm"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            >
              {lstmData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                  {/* LSTM Header Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                    {/* Signal + Confidence */}
                    <div
                      style={{
                        background: 'var(--bg-deep)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        padding: 'var(--space-md)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
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
                          Prediction Signal
                        </span>
                        <span
                          style={{
                            padding: '2px 10px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            background: `${lstmSignalInfo.color}18`,
                            color: lstmSignalInfo.color,
                            border: `1px solid ${lstmSignalInfo.color}30`,
                          }}
                        >
                          {lstmSignalInfo.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        {lstmSignalInfo.icon}
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '1.75rem',
                            fontWeight: 800,
                            color: lstmSignalInfo.color,
                            textShadow: `0 0 20px ${lstmSignalInfo.color}40`,
                          }}
                        >
                          {lstmConfPct}%
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 'var(--space-sm)',
                          width: '100%',
                          height: 4,
                          background: 'var(--bg-elevated)',
                          borderRadius: 'var(--radius-full)',
                          overflow: 'hidden',
                        }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${lstmConfPct}%` }}
                          transition={{ duration: 1, ease: [0.19, 1, 0.22, 1] }}
                          style={{
                            height: '100%',
                            borderRadius: 'var(--radius-full)',
                            background: lstmSignalInfo.color,
                            boxShadow: `0 0 8px ${lstmSignalInfo.color}60`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Price Target + Model Status */}
                    <div
                      style={{
                        background: 'var(--bg-deep)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        padding: 'var(--space-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
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
                          Price Target (1d)
                        </span>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            color: 'var(--text-primary)',
                            marginTop: 4,
                          }}
                        >
                          {lstmData.price_target != null
                            ? `$${lstmData.price_target.toFixed(5)}`
                            : '---'}
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: isTrained
                            ? 'rgba(0, 255, 136, 0.08)'
                            : 'rgba(255, 51, 102, 0.08)',
                          alignSelf: 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: isTrained
                              ? 'var(--neon-emerald)'
                              : 'var(--neon-ruby)',
                            boxShadow: isTrained
                              ? '0 0 6px var(--neon-emerald)'
                              : '0 0 6px var(--neon-ruby)',
                          }}
                        />
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.5625rem',
                            fontWeight: 600,
                            color: isTrained
                              ? 'var(--neon-emerald)'
                              : 'var(--neon-ruby)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Model: {isTrained ? 'Trained' : 'Untrained'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Feature Importance */}
                  {lstmData.features && Object.keys(lstmData.features).length > 0 && (
                    <FeatureImportanceChart features={lstmData.features} />
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={Brain}
                  title="No LSTM Data"
                  subtitle="Awaiting prediction from the LSTM trading agent"
                />
              )}
            </motion.div>
          )}

          {activeTab === 'cnn' && (
            <motion.div
              key="cnn"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            >
              {cnnData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                  {/* Pattern Display Card */}
                  <PatternDisplayCard
                    pattern={cnnData.pattern || ''}
                    confidence={cnnData.confidence ?? 0}
                    signal={cnnData.signal || 'neutral'}
                    rulePatterns={cnnData.rule_patterns || []}
                  />

                  {/* Signal Summary Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--bg-deep)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      padding: 'var(--space-md)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <Activity size={14} style={{ color: 'var(--text-secondary)' }} />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.6875rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Detection Window:
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {cnnData.report?.includes('Window:')
                          ? cnnData.report.match(/Window:\s*(\d+)/)?.[1] || '120'
                          : '120'} days
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Zap size={10} style={{ color: 'var(--text-tertiary)' }} />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.5625rem',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        CNN Pattern Agent
                      </span>
                    </div>
                  </div>

                  {/* Pattern Probability Chart */}
                  <PatternProbabilityChart
                    detectedPattern={cnnData.pattern || ''}
                    confidence={cnnData.confidence ?? 0}
                  />
                </div>
              ) : (
                <EmptyState
                  icon={Activity}
                  title="No CNN Data"
                  subtitle="Awaiting pattern recognition from the CNN agent"
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-3xl) var(--space-lg)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-md)',
        }}
      >
        <Icon size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
      </div>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.9375rem',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          marginBottom: 4,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6875rem',
          color: 'var(--text-tertiary)',
          maxWidth: 240,
        }}
      >
        {subtitle}
      </p>
    </motion.div>
  );
}

function getLstmSignalInfo(signal) {
  const s = (signal || 'neutral').toLowerCase();
  if (s === 'bullish') {
    return {
      label: 'BULLISH',
      color: 'var(--neon-emerald)',
      icon: <TrendingUp size={18} style={{ color: 'var(--neon-emerald)' }} />,
    };
  }
  if (s === 'bearish') {
    return {
      label: 'BEARISH',
      color: 'var(--neon-ruby)',
      icon: <TrendingDown size={18} style={{ color: 'var(--neon-ruby)' }} />,
    };
  }
  return {
    label: 'NEUTRAL',
    color: 'var(--text-tertiary)',
    icon: <BarChart3 size={18} style={{ color: 'var(--text-tertiary)' }} />,
  };
}
