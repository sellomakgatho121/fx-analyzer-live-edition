'use client';
import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, AlertCircle } from 'lucide-react';

import PhaseIndicator from './PhaseIndicator';
import AgentCardNew from './AgentCardNew';
import ParallelAnalystsGrid from './ParallelAnalystsGrid';
import BullBearDebate from './BullBearDebate';
import TraderDecisionPanel from './TraderDecisionPanel';
import RiskDebatePanel from './RiskDebatePanel';

/**
 * Compute phaseStates array from debateState
 * Returns ['pending'|'active'|'done'|'skipped'] for phases 0-5
 */
function computePhaseStates(debateState) {
  const phase = debateState?.phase ?? 0;
  const states = ['pending', 'pending', 'pending', 'pending', 'pending', 'pending'];

  // Mark phases before current as done
  for (let i = 0; i < phase; i++) {
    states[i] = 'done';
  }
  states[phase] = 'active';

  return states;
}

/**
 * Determine what phase content to show based on current phase
 */
function getPhaseComponent(debateState) {
  const phase = debateState?.phase ?? 0;
  const data = debateState || {};

  switch (phase) {
    case 0:
      // Company Overview Analyst
      return {
        key: 'phase-0',
        component: (
          <motion.div
            key="phase-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
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
                Phase 1 — Company Overview
              </h3>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border-default), transparent)' }} />
            </div>
            <AgentCardNew
              title="Company Overview Analyst"
              icon={Brain}
              color="#00f2ff"
              signal={data.agentOutput?.signal || data.companyOverview?.signal || 'NEUTRAL'}
              confidence={data.agentOutput?.confidence || data.companyOverview?.confidence || 0}
              analysis={data.agentOutput?.analysis || data.companyOverview?.report || data.companyOverview?.analysis || ''}
            />
          </motion.div>
        ),
      };

    case 1:
      return {
        key: 'phase-1',
        component: (
          <ParallelAnalystsGrid
            key="phase-1"
            analysts={data.analystsOutputs || data.analysts || []}
          />
        ),
      };

    case 2:
      return {
        key: 'phase-2',
        component: (
          <BullBearDebate
            key="phase-2"
            debateRounds={data.investmentDebate || data.bullBearDebate || []}
            maxRounds={data.maxRounds || 3}
          />
        ),
      };

    case 3:
      // Research Manager synthesis
      const rmOutput = data.agentOutput?.agent_name?.toLowerCase?.()?.includes?.('research')
        ? data.agentOutput
        : data.researchManager || data.synthesis || data.agentOutput;

      return {
        key: 'phase-3',
        component: (
          <motion.div
            key="phase-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
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
                background: 'linear-gradient(180deg, var(--neon-violet), var(--acid-lime))',
              }} />
              <h3 style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}>
                Phase 3 — Research Manager Synthesis
              </h3>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--border-default), transparent)' }} />
            </div>
            <AgentCardNew
              title="Research Manager"
              icon={Brain}
              color="#a855f7"
              signal={rmOutput?.signal || rmOutput?.recommendation || 'NEUTRAL'}
              confidence={rmOutput?.confidence || 0}
              analysis={rmOutput?.analysis || rmOutput?.reasoning || rmOutput?.synthesis || ''}
            />
          </motion.div>
        ),
      };

    case 4:
      return {
        key: 'phase-4',
        component: (
          <TraderDecisionPanel
            key="phase-4"
            decision={data.traderDecision || data.agentOutput || {}}
          />
        ),
      };

    case 5:
      return {
        key: 'phase-5',
        component: (
          <RiskDebatePanel
            key="phase-5"
            riskDebate={data.riskDebate || []}
            riskDecision={data.riskManagerDecision || data.riskDecision || null}
          />
        ),
      };

    default:
      return null;
  }
}

export default function DebateTimeline({ debateState = null }) {
  const scrollRef = useRef(null);

  // Auto-scroll to active phase when it changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [debateState?.phase]);

  // Empty/null state
  if (!debateState) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          padding: '40px 24px',
          textAlign: 'center',
          borderRadius: 'var(--radius-lg)',
          border: '1px dashed var(--border-default)',
          background: 'var(--bg-card)',
        }}
      >
        <AlertCircle size={24} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          marginBottom: '4px',
        }}>
          No Debate Active
        </p>
        <p style={{
          fontSize: '0.75rem',
          color: 'var(--text-tertiary)',
        }}>
          Select a pair and request analysis to see the full 16-agent investment committee workflow.
        </p>
      </motion.div>
    );
  }

  const phaseStates = computePhaseStates(debateState);
  const currentPhase = debateState.phase ?? 0;
  const phaseContent = getPhaseComponent(debateState);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-default)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px 12px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <Brain size={18} style={{ color: 'var(--neon-cyan)' }} />
        <div>
          <h2 style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
          }}>
            LangGraph Debate Theater
          </h2>
          <p style={{
            fontSize: '0.625rem',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
          }}>
            16-Agent Investment Committee • Phase {currentPhase + 1}/6
          </p>
        </div>
      </div>

      {/* Phase Indicator */}
      <div style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}>
        <PhaseIndicator currentPhase={currentPhase} phaseStates={phaseStates} />
      </div>

      {/* Phase Content */}
      <div ref={scrollRef} style={{ padding: '20px' }}>
        <AnimatePresence mode="wait">
          {phaseContent ? (
            <motion.div
              key={phaseContent.key}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
            >
              {phaseContent.component}
            </motion.div>
          ) : (
            <motion.div
              key="unknown-phase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                padding: '32px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.8125rem',
              }}
            >
              Unknown phase: {currentPhase}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
