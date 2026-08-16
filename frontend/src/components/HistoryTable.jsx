'use client';


import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, TrendingUp, TrendingDown, Filter, ChevronDown } from 'lucide-react';
import useSessionStore from '@/store/sessionStore';
import socketEventBus from '@/lib/socketEventBus';

export default function HistoryTable() {
    const [trades, setTrades] = useState([]);
    const [filter, setFilter] = useState('all');
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Fetch trades from backend
    useEffect(() => {
        const fetchTrades = async () => {
            try {
                const { token } = useSessionStore.getState();
                const res = await fetch('/api/trades', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    // Map API format to component format — fail-closed: unknown
                    // values stay null (rendered as '—') instead of 0.
                    const formatted = data.map(t => ({
                        id: t.id || Math.random(),
                        symbol: t.symbol,
                        action: t.action,
                        entry: t.entry_price != null ? t.entry_price : null,
                        exit: t.exit_price != null ? t.exit_price : null,
                        profit: t.pl != null ? t.pl : null,
                        time: new Date(t.timestamp).toLocaleString(),
                        status: (t.pl != null && t.exit_price != null)
                            ? (t.pl > 0 ? 'win' : t.pl < 0 ? 'loss' : 'open')
                            : (t.status === 'closed' ? 'closed' : 'open')
                    }));
                    setTrades(formatted);
                }
            } catch (e) {
                console.error("Failed to fetch history:", e);
            }
        };

        fetchTrades();
        // Poll for updates (simple sync)
        const interval = setInterval(fetchTrades, 5000);
        // Immediate refresh when a position opens or closes — no waiting on the poll
        const onTradeEvent = () => setTimeout(fetchTrades, 500);
        socketEventBus.on('trade:executed', onTradeEvent);
        socketEventBus.on('trade:closed', onTradeEvent);
        return () => {
            clearInterval(interval);
            socketEventBus.off('trade:executed', onTradeEvent);
            socketEventBus.off('trade:closed', onTradeEvent);
        };
    }, []);

    const filteredTrades = trades.filter((trade) => {
        if (filter === 'all') return true;
        return trade.status === filter;
    });

    const stats = {
        total: trades.length,
        wins: trades.filter(t => t.status === 'win').length,
        losses: trades.filter(t => t.status === 'loss').length,
        // Only sum known P/L — null (unknown) trades are excluded, not counted as 0.
        totalProfit: trades.reduce((sum, t) => sum + (t.profit != null ? t.profit : 0), 0),
    };

    const winRate = ((stats.wins / stats.total) * 100).toFixed(1);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="neo-card"
            style={{ overflow: 'hidden' }}
        >
            {/* Header */}
            <div
                className="flex justify-between items-center p-lg"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
                <div className="flex items-center gap-sm">
                    <History size={18} className="text-cyan" />
                    <h3 className="text-title">Trade History</h3>
                </div>

                {/* Filter Dropdown */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className="flex items-center gap-xs btn-ghost"
                        style={{
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-default)',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            fontSize: '0.75rem',
                        }}
                    >
                        <Filter size={12} />
                        {filter === 'all' ? 'All' : filter === 'win' ? 'Wins' : 'Losses'}
                        <ChevronDown size={12} />
                    </button>

                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '4px',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 'var(--radius-md)',
                                    overflow: 'hidden',
                                    zIndex: 10,
                                }}
                            >
                                {['all', 'win', 'loss'].map((option) => (
                                    <button
                                        key={option}
                                        onClick={() => { setFilter(option); setIsFilterOpen(false); }}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            padding: '8px 16px',
                                            textAlign: 'left',
                                            background: filter === option ? 'rgba(0, 242, 255, 0.1)' : 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: filter === option ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                                            fontSize: '0.75rem',
                                            textTransform: 'capitalize',
                                        }}
                                    >
                                        {option === 'all' ? 'All Trades' : option === 'win' ? 'Wins Only' : 'Losses Only'}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Stats Bar */}
            <div
                className="flex gap-lg p-md"
                style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}
            >
                <div>
                    <span className="text-caption">Win Rate</span>
                    <p className="text-mono text-cyan" style={{ fontWeight: 700 }}>{winRate}%</p>
                </div>
                <div>
                    <span className="text-caption">Total Trades</span>
                    <p className="text-mono" style={{ fontWeight: 700 }}>{stats.total}</p>
                </div>
                <div>
                    <span className="text-caption">Total P/L</span>
                    <p className={`text-mono ${stats.totalProfit >= 0 ? 'text-emerald' : 'text-ruby'}`} style={{ fontWeight: 700 }}>
                        {stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Table */}
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-surface)' }}>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Pair</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Type</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Entry</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>Exit</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>P/L</th>
                        </tr>
                    </thead>
                    <tbody>
                        <AnimatePresence>
                            {filteredTrades.map((trade, index) => (
                                <motion.tr
                                    key={trade.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ delay: index * 0.05 }}
                                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                                >
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ fontWeight: 600 }}>{trade.symbol}</span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span className={`badge ${trade.action === 'BUY' ? 'badge-emerald' : 'badge-ruby'}`}>
                                            {trade.action === 'BUY' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                            {trade.action}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span className="text-mono text-muted">{trade.entry != null ? Number(trade.entry).toFixed(5) : '—'}</span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span className="text-mono text-muted">{trade.exit != null ? Number(trade.exit).toFixed(5) : '—'}</span>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                        {trade.profit != null ? (
                                            <span className={`text-mono ${trade.profit >= 0 ? 'text-emerald' : 'text-ruby'}`} style={{ fontWeight: 600 }}>
                                                {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-mono text-muted">—</span>
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
}
