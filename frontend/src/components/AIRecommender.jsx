'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, ChevronRight, X, TrendingUp, Activity } from 'lucide-react';

export default function AIRecommender({ signals = [], symbol = '' }) {
  const [recommendations, setRecommendations] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [expanded, setExpanded] = useState(null);

  // Derive recommendations from recent signal patterns
  useEffect(() => {
    if (!signals || signals.length < 2) return;

    const recos = [];
    const symbolGroups = {};

    // Group signals by symbol
    signals.forEach(sig => {
      const sym = sig.symbol || symbol;
      if (!symbolGroups[sym]) symbolGroups[sym] = [];
      symbolGroups[sym].push(sig);
    });

    Object.entries(symbolGroups).forEach(([sym, sigs]) => {
      const buySignals = sigs.filter(s => s.action === 'BUY');
      const sellSignals = sigs.filter(s => s.action === 'SELL');
      const avgConfidence = sigs.reduce((s, x) => s + (x.confidence || 0), 0) / sigs.length;

      // Strong directional consensus = recommendation
      if (buySignals.length >= 2 && avgConfidence > 0.7) {
        recos.push({
          id: `${sym}-buy-reco`,
          symbol: sym,
          direction: 'BUY',
          confidence: avgConfidence,
          reason: `${buySignals.length} consecutive BUY signals with ${(avgConfidence * 100).toFixed(0)}% average confidence. Technical and sentiment alignment detected.`,
          strength: avgConfidence > 0.85 ? 'strong' : 'moderate',
        });
      } else if (sellSignals.length >= 2 && avgConfidence > 0.7) {
        recos.push({
          id: `${sym}-sell-reco`,
          symbol: sym,
          direction: 'SELL',
          confidence: avgConfidence,
          reason: `${sellSignals.length} consecutive SELL signals with ${(avgConfidence * 100).toFixed(0)}% average confidence. Bearish alignment across multiple experts.`,
          strength: avgConfidence > 0.85 ? 'strong' : 'moderate',
        });
      }

      // Mixed signals = caution recommendation
      if (buySignals.length > 0 && sellSignals.length > 0 && sigs.length >= 3) {
        recos.push({
          id: `${sym}-mixed-reco`,
          symbol: sym,
          direction: 'HOLD',
          confidence: 0.5,
          reason: `Conflicting signals detected for ${sym}. Experts disagree on direction. Recommended to wait for clearer consensus.`,
          strength: 'caution',
        });
      }
    });

    setRecommendations(recos.filter(r => !dismissed.includes(r.id)));
  }, [signals, symbol, dismissed]);

  const handleDismiss = (id) => {
    setDismissed(prev => [...prev, id]);
  };

  const strengthColors = {
    strong: '#00ff88',
    moderate: '#00f2ff',
    caution: '#ffd700',
  };

  if (recommendations.length === 0) return null;

  return (
    <div style={{ marginBottom: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Lightbulb size={14} style={{ color: '#ffd700' }} />
        <span style={{
          fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text-tertiary)'
        }}>
          AI Insights
        </span>
      </div>

      <AnimatePresence mode="popLayout">
        {recommendations.map((reco) => (
          <motion.div
            key={reco.id}
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
            style={{
              background: 'var(--bg-card)',
              border: `1px solid ${strengthColors[reco.strength]}20`,
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '8px',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
            }}
            onClick={() => setExpanded(expanded === reco.id ? null : reco.id)}
          >
            {/* Left accent */}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
              background: strengthColors[reco.strength],
              borderRadius: '12px 0 0 12px',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {reco.direction === 'BUY' ? (
                  <TrendingUp size={14} style={{ color: '#00ff88' }} />
                ) : reco.direction === 'SELL' ? (
                  <Activity size={14} style={{ color: '#ff3366' }} />
                ) : (
                  <Activity size={14} style={{ color: '#ffd700' }} />
                )}
                <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{reco.symbol}</span>
                <span style={{
                  fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: '4px',
                  background: `${strengthColors[reco.strength]}15`,
                  color: strengthColors[reco.strength],
                }}>
                  {reco.direction} • {reco.strength}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); handleDismiss(reco.id); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-tertiary)', padding: '2px',
                  }}
                >
                  <X size={12} />
                </motion.button>
                <motion.div
                  animate={{ rotate: expanded === reco.id ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                </motion.div>
              </div>
            </div>

            {/* Expanded detail */}
            <AnimatePresence>
              {expanded === reco.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}
                >
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {reco.reason}
                  </p>
                  <div style={{
                    marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '0.6875rem', color: 'var(--text-tertiary)',
                  }}>
                    Confidence: <span style={{ fontFamily: 'var(--font-mono)', color: strengthColors[reco.strength] }}>
                      {(reco.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
