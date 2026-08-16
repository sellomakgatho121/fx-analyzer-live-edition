'use client';
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ListOrdered,
    TrendingUp,
    TrendingDown,
    Filter,
    Clock,
    CheckCircle,
    XCircle,
    DollarSign,
} from 'lucide-react';

const TABS = [
    { key: 'all', label: 'All' },
    { key: 'manual', label: 'Manual' },
    { key: 'auto', label: 'Auto' },
];

export default function TradeListPanel({ trades = [], loading = false }) {
    const [activeTab, setActiveTab] = useState('all');
    const [sortOrder, setSortOrder] = useState('newest');

    const filteredTrades = useMemo(() => {
        let filtered = [...trades];

        // Filter by type tab
        if (activeTab === 'manual') {
            filtered = filtered.filter(t => t.type === 'manual');
        } else if (activeTab === 'auto') {
            filtered = filtered.filter(t => t.type === 'auto');
        }

        // Sort
        filtered.sort((a, b) => {
            const timeA = new Date(a.openTime || a.timestamp || 0).getTime();
            const timeB = new Date(b.openTime || b.timestamp || 0).getTime();
            return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
        });

        return filtered.slice(0, 50);
    }, [trades, activeTab, sortOrder]);

    const countByType = useMemo(() => {
        const counts = { all: trades.length, manual: 0, auto: 0 };
        trades.forEach(t => {
            if (t.type === 'manual') counts.manual++;
            else if (t.type === 'auto') counts.auto++;
        });
        return counts;
    }, [trades]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="neo-card"
            style={{ overflow: 'hidden' }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between"
                style={{
                    padding: 'var(--space-md) var(--space-lg)',
                    borderBottom: '1px solid var(--border-subtle)',
                }}
            >
                <div className="flex items-center gap-sm">
                    <div
                        style={{
                            padding: '6px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(0, 242, 255, 0.1)',
                            display: 'flex',
                        }}
                    >
                        <ListOrdered size={16} style={{ color: 'var(--neon-cyan)' }} />
                    </div>
                    <h3 className="text-title">Trade History</h3>
                    <span className="badge badge-cyan">{trades.length}</span>
                </div>

                {/* Sort Toggle */}
                <button
                    onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                    className="btn-ghost"
                    style={{
                        padding: '4px 10px',
                        fontSize: '0.6875rem',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}
                    title={`Sorted ${sortOrder === 'newest' ? 'newest first' : 'oldest first'}`}
                >
                    <Clock size={12} />
                    {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
                </button>
            </div>

            {/* Tabs */}
            <div
                className="flex"
                style={{
                    padding: 'var(--space-sm) var(--space-lg)',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    gap: 'var(--space-xs)',
                }}
            >
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className="relative"
                        style={{
                            padding: '6px 16px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            cursor: 'pointer',
                            background: activeTab === tab.key
                                ? 'rgba(0, 242, 255, 0.1)'
                                : 'transparent',
                            color: activeTab === tab.key
                                ? 'var(--neon-cyan)'
                                : 'var(--text-secondary)',
                            transition: 'all 0.15s ease',
                        }}
                    >
                        {tab.label}
                        <span
                            style={{
                                marginLeft: '6px',
                                fontSize: '0.625rem',
                                opacity: 0.6,
                                fontFamily: 'var(--font-mono)',
                            }}
                        >
                            {countByType[tab.key]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Trade List */}
            <div
                style={{
                    maxHeight: '360px',
                    overflowY: 'auto',
                }}
            >
                {loading ? (
                    <div style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
                        {[1, 2, 3].map(i => (
                            <div
                                key={i}
                                className="skeleton"
                                style={{
                                    height: '48px',
                                    marginBottom: '8px',
                                    borderRadius: 'var(--radius-sm)',
                                }}
                            />
                        ))}
                    </div>
                ) : filteredTrades.length === 0 ? (
                    <div
                        style={{
                            padding: 'var(--space-xl)',
                            textAlign: 'center',
                            color: 'var(--text-tertiary)',
                        }}
                    >
                        <Filter size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                        <p className="text-body" style={{ color: 'var(--text-muted)' }}>
                            {trades.length === 0
                                ? 'No trades yet. Execute a trade to see it here.'
                                : 'No trades match the selected filter.'}
                        </p>
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {filteredTrades.map((trade, idx) => (
                            <motion.div
                                key={trade.id || idx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.02, duration: 0.2 }}
                                style={{
                                    padding: '10px var(--space-lg)',
                                    borderBottom: '1px solid var(--border-subtle)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    transition: 'background 0.15s',
                                    cursor: 'default',
                                }}
                                className="hover:bg-white/[0.02]"
                            >
                                {/* Left: Action + Symbol */}
                                <div className="flex items-center gap-md" style={{ minWidth: 0 }}>
                                    {/* Direction Badge */}
                                    <div
                                        style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: 'var(--radius-sm)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            background: trade.action === 'BUY'
                                                ? 'rgba(0, 255, 136, 0.1)'
                                                : 'rgba(255, 51, 102, 0.1)',
                                        }}
                                    >
                                        {trade.action === 'BUY' ? (
                                            <TrendingUp size={14} style={{ color: 'var(--neon-emerald)' }} />
                                        ) : (
                                            <TrendingDown size={14} style={{ color: 'var(--neon-ruby)' }} />
                                        )}
                                    </div>

                                    <div style={{ minWidth: 0 }}>
                                        <div className="flex items-center gap-xs">
                                            <span
                                                style={{
                                                    fontWeight: 600,
                                                    fontSize: '0.8125rem',
                                                    color: trade.action === 'BUY'
                                                        ? 'var(--neon-emerald)'
                                                        : 'var(--neon-ruby)',
                                                }}
                                            >
                                                {trade.action}
                                            </span>
                                            <span style={{
                                                fontWeight: 600,
                                                fontSize: '0.8125rem',
                                                color: 'var(--text-primary)',
                                            }}>
                                                {trade.symbol}
                                            </span>
                                            {/* Type badge */}
                                            <span
                                                style={{
                                                    fontSize: '0.5625rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em',
                                                    padding: '1px 6px',
                                                    borderRadius: '3px',
                                                    background: trade.type === 'auto'
                                                        ? 'rgba(204, 255, 0, 0.1)'
                                                        : 'rgba(0, 242, 255, 0.1)',
                                                    color: trade.type === 'auto'
                                                        ? 'var(--acid-lime)'
                                                        : 'var(--neon-cyan)',
                                                }}
                                            >
                                                {trade.type || 'manual'}
                                            </span>
                                        </div>
                                        <div
                                            className="flex items-center gap-sm"
                                            style={{ marginTop: '2px' }}
                                        >
                                            <span style={{
                                                fontSize: '0.6875rem',
                                                color: 'var(--text-tertiary)',
                                                fontFamily: 'var(--font-mono)',
                                            }}>
                                                {trade.entryPrice?.toFixed(5)}
                                            </span>
                                            {trade.lotSize && (
                                                <span style={{
                                                    fontSize: '0.625rem',
                                                    color: 'var(--text-muted)',
                                                }}>
                                                    {trade.lotSize} lot
                                                </span>
                                            )}
                                            {/* Status indicator */}
                                            {trade.status === 'open' ? (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    fontSize: '0.5625rem',
                                                    color: 'var(--neon-cyan)',
                                                    fontWeight: 600,
                                                }}>
                                                    <span style={{
                                                        width: '4px',
                                                        height: '4px',
                                                        borderRadius: '50%',
                                                        background: 'var(--neon-cyan)',
                                                        display: 'inline-block',
                                                    }} />
                                                    OPEN
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: '0.5625rem',
                                                    color: 'var(--text-tertiary)',
                                                }}>
                                                    {trade.closeReason || 'CLOSED'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: P&L */}
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div
                                        style={{
                                            fontSize: '0.8125rem',
                                            fontWeight: 700,
                                            fontFamily: 'var(--font-mono)',
                                            color: trade.status === 'open'
                                                ? (trade.profit >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)')
                                                : (trade.profit >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)'),
                                        }}
                                    >
                                        {trade.status === 'open' ? '' : (trade.profit >= 0 ? '+' : '')}
                                        ${(trade.profit || 0).toFixed(2)}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '0.625rem',
                                            fontFamily: 'var(--font-mono)',
                                            color: (trade.pips || 0) >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)',
                                        }}
                                    >
                                        {(trade.pips || 0) >= 0 ? '+' : ''}
                                        {(trade.pips || 0).toFixed(1)} pips
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Footer with summary */}
            {filteredTrades.length > 0 && (
                <div
                    style={{
                        padding: 'var(--space-sm) var(--space-lg)',
                        borderTop: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--bg-surface)',
                    }}
                >
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                        Showing {filteredTrades.length} of {trades.length} trades
                    </span>
                    <div className="flex items-center gap-md">
                        <span style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                            W/L: <span style={{ color: 'var(--neon-emerald)' }}>
                                {trades.filter(t => t.profit > 0).length}
                            </span>
                            /<span style={{ color: 'var(--neon-ruby)' }}>
                                {trades.filter(t => t.profit < 0).length}
                            </span>
                        </span>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
