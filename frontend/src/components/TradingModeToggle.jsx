'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Zap, AlertCircle } from 'lucide-react';

export default function TradingModeToggle({ mode, onModeChange, paperMetrics }) {
    const isPaper = mode === 'paper';

    return (
        <div className="trading-mode-toggle">
            <div className="flex items-center gap-sm">
                <button
                    onClick={() => onModeChange('paper')}
                    className="mode-btn"
                    style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        background: isPaper ? 'rgba(0, 242, 255, 0.1)' : 'transparent',
                        border: `1px solid ${isPaper ? 'var(--neon-cyan)' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-md)',
                        color: isPaper ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        transition: 'all 0.2s',
                    }}
                >
                    <Shield size={16} />
                    <span>Paper Trading</span>
                    {isPaper && paperMetrics && (
                        <span
                            className="badge badge-cyan"
                            style={{
                                marginLeft: 'var(--space-xs)',
                                fontSize: '0.75rem'
                            }}
                        >
                            ${paperMetrics.balance.toFixed(2)}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => onModeChange('live')}
                    className="mode-btn"
                    style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        background: !isPaper ? 'rgba(255, 51, 102, 0.1)' : 'transparent',
                        border: `1px solid ${!isPaper ? 'var(--neon-ruby)' : 'var(--border-default)'}`,
                        borderRadius: 'var(--radius-md)',
                        color: !isPaper ? 'var(--neon-ruby)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        transition: 'all 0.2s',
                    }}
                >
                    <Zap size={16} />
                    <span>Live Trading</span>
                    {!isPaper && (
                        <motion.span
                            animate={{ opacity: [1, 0.5, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: 'var(--neon-ruby)',
                                marginLeft: 'var(--space-xs)'
                            }}
                        />
                    )}
                </button>
            </div>

            {/* Warning for live mode */}
            {!isPaper && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-xs"
                    style={{
                        marginTop: 'var(--space-sm)',
                        padding: 'var(--space-sm)',
                        background: 'rgba(255, 51, 102, 0.05)',
                        border: '1px solid rgba(255, 51, 102, 0.2)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.75rem',
                        color: 'var(--neon-ruby)'
                    }}
                >
                    <AlertCircle size={14} />
                    <span>LIVE MODE: Real money at risk</span>
                </motion.div>
            )}
        </div>
    );
}
