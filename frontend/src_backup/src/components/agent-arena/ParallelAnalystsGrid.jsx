'use client';
import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  MessageCircle,
  Newspaper,
  BarChart3,
  Users,
  Package,
} from 'lucide-react';
import AgentCardNew from './AgentCardNew';

const ANALYST_CONFIG = [
  {
    key: 'market',
    name: 'Market Analyst',
    icon: TrendingUp,
    color: '#00f2ff',
    signalField: 'signal',
  },
  {
    key: 'sentiment',
    name: 'Sentiment Analyst',
    icon: MessageCircle,
    color: '#a855f7',
    signalField: 'sentiment',
  },
  {
    key: 'news',
    name: 'News Analyst',
    icon: Newspaper,
    color: '#f97316',
    signalField: 'signal',
  },
  {
    key: 'fundamentals',
    name: 'Fundamentals Analyst',
    icon: BarChart3,
    color: '#00ff88',
    signalField: 'signal',
  },
  {
    key: 'shareholder',
    name: 'Shareholder Analyst',
    icon: Users,
    color: '#ffd700',
    signalField: 'signal',
  },
  {
    key: 'product',
    name: 'Product Analyst',
    icon: Package,
    color: '#ff0f42',
    signalField: 'signal',
  },
];

export default function ParallelAnalystsGrid({ analysts = [] }) {
  if (!analysts || analysts.length === 0) return null;

  // Map incoming analysts to our config by name matching (case-insensitive)
  const enrichedAnalysts = ANALYST_CONFIG.map((config) => {
    const match = analysts.find(
      (a) => a.name && a.name.toLowerCase().includes(config.name.toLowerCase().replace(' analyst', ''))
    ) || analysts.find(
      (a) => config.key === 'market' && a.name?.toLowerCase().includes('market')
    ) || analysts.find(
      (a) => config.key === 'sentiment' && a.name?.toLowerCase().includes('sentiment')
    ) || analysts.find(
      (a) => config.key === 'news' && a.name?.toLowerCase().includes('news')
    ) || analysts.find(
      (a) => config.key === 'fundamentals' && a.name?.toLowerCase().includes('fundamental')
    ) || analysts.find(
      (a) => config.key === 'shareholder' && a.name?.toLowerCase().includes('shareholder')
    ) || analysts.find(
      (a) => config.key === 'product' && a.name?.toLowerCase().includes('product')
    );

    return {
      ...config,
      analysis: match || null,
    };
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ width: '100%' }}
    >
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
          background: 'linear-gradient(180deg, var(--neon-cyan), var(--neon-violet))',
        }} />
        <h3 style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          Phase 1 — Parallel Analysis
        </h3>
        <div style={{
          flex: 1,
          height: '1px',
          background: 'linear-gradient(90deg, var(--border-default), transparent)',
        }} />
        <span style={{
          fontSize: '0.625rem',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          background: 'var(--bg-surface)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
        }}>
          {analysts.length}/6 active
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '12px',
      }}>
        {enrichedAnalysts.map((item, index) => {
          const analysis = item.analysis;
          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: index * 0.08,
                duration: 0.4,
                ease: [0.19, 1, 0.22, 1],
              }}
            >
              <AgentCardNew
                title={item.name}
                icon={item.icon}
                color={item.color}
                signal={analysis?.[item.signalField] || analysis?.signal || 'NEUTRAL'}
                confidence={analysis?.confidence || 0}
                analysis={analysis?.report || analysis?.analysis || ''}
              />
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
