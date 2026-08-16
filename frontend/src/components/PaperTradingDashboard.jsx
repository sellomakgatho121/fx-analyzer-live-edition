'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Percent,
    RefreshCw,
    X,
    BarChart3
} from 'lucide-react';

export default function PaperTradingDashboard({ engine, onReset, onUpdate, onClose }) {
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    if (!engine) return null;

    const metrics = engine.getMetrics();
    const equityCurve = engine.getEquityCurve();

    const handleReset = () => {
        if (showResetConfirm) {
            onReset();
            setShowResetConfirm(false);
        } else {
            setShowResetConfirm(true);
            setTimeout(() => setShowResetConfirm(false), 3000);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '90%',
                maxWidth: '900px',
                maxHeight: '85vh',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
                zIndex: 100,
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                className="flex justify-between items-center"
                style={{
                    padding: 'var(--space-lg)',
                    borderBottom: '1px solid var(--border-subtle)',
                }}
            >
                <div className="flex items-center gap-md">
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: 'var(--radius-md)',
                            background: 'rgba(0, 242, 255, 0.1)',
                            border: '1px solid var(--neon-cyan)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <BarChart3 size={20} className="text-cyan" />
                    </div>
                    <div>
                        <h2 className="text-title">Paper Trading Dashboard</h2>
                        <p className="text-caption text-muted">Virtual account performance</p>
                    </div>
                </div>

                <div className="flex items-center gap-sm">
                    <button
                        onClick={() => {
                            engine.closeAllPositions({}); // Pass current prices if possible, or engine uses last known
                            onUpdate?.();
                        }}
                        className="btn-ghost text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded"
                    >
                        Close All
                    </button>
                    <button
                        onClick={handleReset}
                        className="btn-ghost"
                        style={{
                            padding: 'var(--space-sm) var(--space-md)',
                            background: showResetConfirm ? 'rgba(255, 51, 102, 0.1)' : 'transparent',
                            border: `1px solid ${showResetConfirm ? 'var(--neon-ruby)' : 'var(--border-default)'}`,
                            color: showResetConfirm ? 'var(--neon-ruby)' : 'var(--text-secondary)',
                        }}
                    >
                        <RefreshCw size={14} />
                        <span>{showResetConfirm ? 'Confirm?' : 'Reset'}</span>
                    </button>
                    <button onClick={onClose} className="btn-icon">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ padding: 'var(--space-lg)', overflowY: 'auto', maxHeight: 'calc(85vh - 100px)' }}>
                {/* Metrics Grid */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 'var(--space-md)',
                        marginBottom: 'var(--space-lg)'
                    }}
                >
                    {/* Balance */}
                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <div className="flex items-center justify-between">
                            <span className="text-caption text-muted">Balance</span>
                            <DollarSign size={16} className="text-muted" />
                        </div>
                        <p className="text-title" style={{ marginTop: 'var(--space-sm)' }}>
                            ${metrics.balance.toFixed(2)}
                        </p>
                        <p className="text-caption text-muted">
                            Initial: ${metrics.initialBalance.toFixed(2)}
                        </p>
                    </div>

                    {/* Equity */}
                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <div className="flex items-center justify-between">
                            <span className="text-caption text-muted">Equity</span>
                            <TrendingUp size={16} className="text-emerald" />
                        </div>
                        <p className="text-title" style={{ marginTop: 'var(--space-sm)' }}>
                            ${metrics.equity.toFixed(2)}
                        </p>
                        <p className="text-caption" style={{ color: metrics.unrealizedPL >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                            Unrealized: ${metrics.unrealizedPL.toFixed(2)}
                        </p>
                    </div>

                    {/* Profit/Loss */}
                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <div className="flex items-center justify-between">
                            <span className="text-caption text-muted">Total P/L</span>
                            {metrics.profitLoss >= 0 ? (
                                <TrendingUp size={16} className="text-emerald" />
                            ) : (
                                <TrendingDown size={16} className="text-ruby" />
                            )}
                        </div>
                        <p
                            className="text-title"
                            style={{
                                marginTop: 'var(--space-sm)',
                                color: metrics.profitLoss >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)'
                            }}
                        >
                            ${Math.abs(metrics.profitLoss).toFixed(2)}
                        </p>
                        <p className="text-caption" style={{ color: metrics.profitLoss >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                            {metrics.profitLoss >= 0 ? '+' : '-'}{Math.abs(metrics.profitLossPercent).toFixed(2)}%
                        </p>
                    </div>

                    {/* Win Rate */}
                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <div className="flex items-center justify-between">
                            <span className="text-caption text-muted">Win Rate</span>
                            <Percent size={16} className="text-muted" />
                        </div>
                        <p className="text-title" style={{ marginTop: 'var(--space-sm)' }}>
                            {metrics.winRate.toFixed(1)}%
                        </p>
                        <p className="text-caption text-muted">
                            {metrics.winners}W / {metrics.losers}L
                        </p>
                    </div>
                </div>

                {/* Additional Stats */}
                <div className="grid grid-cols-2 gap-md" style={{ marginBottom: 'var(--space-lg)' }}>
                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <p className="text-caption text-muted">Total Trades</p>
                        <p className="text-subtitle" style={{ marginTop: 'var(--space-xs)' }}>{metrics.totalTrades}</p>
                    </div>

                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <p className="text-caption text-muted">Profit Factor</p>
                        <p className="text-subtitle" style={{ marginTop: 'var(--space-xs)', color: metrics.profitFactor >= 1.5 ? 'var(--neon-emerald)' : 'var(--text-primary)' }}>
                            {metrics.profitFactor.toFixed(2)}
                        </p>
                    </div>

                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <p className="text-caption text-muted">Avg Win</p>
                        <p className="text-subtitle text-emerald" style={{ marginTop: 'var(--space-xs)' }}>
                            ${metrics.avgWin.toFixed(2)}
                        </p>
                    </div>

                    <div className="card" style={{ padding: 'var(--space-md)' }}>
                        <p className="text-caption text-muted">Avg Loss</p>
                        <p className="text-subtitle text-ruby" style={{ marginTop: 'var(--space-xs)' }}>
                            ${metrics.avgLoss.toFixed(2)}
                        </p>
                    </div>
                </div>

                {/* Open Positions */}
                {engine.positions.length > 0 && (
                    <div style={{ marginBottom: 'var(--space-lg)' }}>
                        <h3 className="text-subtitle" style={{ marginBottom: 'var(--space-md)' }}>
                            Open Positions ({engine.positions.length})
                        </h3>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {engine.positions.map(pos => (
                                <div
                                    key={pos.id}
                                    className="card"
                                    style={{
                                        padding: 'var(--space-md)',
                                        marginBottom: 'var(--space-sm)',
                                        borderLeft: `3px solid ${pos.action === 'BUY' ? 'var(--neon-emerald)' : 'var(--neon-ruby)'}`
                                    }}
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-body">
                                                <span className="badge" style={{ background: pos.action === 'BUY' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 51, 102, 0.1)', color: pos.action === 'BUY' ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                                                    {pos.action}
                                                </span>
                                                <strong style={{ marginLeft: 'var(--space-sm)' }}>{pos.symbol}</strong>
                                                <span className="text-muted" style={{ marginLeft: 'var(--space-sm)' }}>{pos.lotSize} lots</span>
                                            </p>
                                            <p className="text-caption text-muted" style={{ marginTop: '4px' }}>
                                                Entry: {pos.entryPrice?.toFixed(5)} | SL: {pos.sl?.toFixed(5) || '-'} | TP: {pos.tp?.toFixed(5) || '-'}
                                            </p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p className="text-body" style={{ color: (pos.profit || 0) >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)', fontWeight: 600 }}>
                                                ${(pos.profit || 0).toFixed(2)}
                                            </p>
                                            <div className="flex items-center justify-end gap-2 text-caption">
                                                <span style={{ color: (pos.pips || 0) >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                                                    {(pos.pips || 0) >= 0 ? '+' : ''}{(pos.pips || 0).toFixed(1)} pips
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        // Using last known price or 0 if not available, engine should handle
                                                        engine.closePosition(pos.id, pos.entryPrice);
                                                        onUpdate?.();
                                                    }}
                                                    className="hover:text-red-400 transition-colors"
                                                    title="Close Position"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent History */}
                {engine.history.length > 0 && (
                    <div>
                        <h3 className="text-subtitle" style={{ marginBottom: 'var(--space-md)' }}>
                            Recent Trades (Last 5)
                        </h3>
                        <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                            {engine.history.slice(-5).reverse().map(trade => (
                                <div
                                    key={trade.id}
                                    className="card"
                                    style={{
                                        padding: 'var(--space-sm) var(--space-md)',
                                        marginBottom: 'var(--space-xs)',
                                        borderLeft: `3px solid ${trade.profit >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)'}`
                                    }}
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-body">
                                                <span className="badge badge-sm" style={{ background: trade.action === 'BUY' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 51, 102, 0.1)', color: trade.action === 'BUY' ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                                                    {trade.action}
                                                </span>
                                                <strong style={{ marginLeft: 'var(--space-sm)' }}>{trade.symbol}</strong>
                                            </p>
                                            <p className="text-caption text-muted">{trade.closeReason}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p className="text-body" style={{ color: trade.profit >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)', fontWeight: 600 }}>
                                                {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                                            </p>
                                            <p className="text-caption" style={{ color: trade.pips >= 0 ? 'var(--neon-emerald)' : 'var(--neon-ruby)' }}>
                                                {trade.pips >= 0 ? '+' : ''}{trade.pips.toFixed(1)} pips
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
