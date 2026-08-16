'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Activity, Calendar } from 'lucide-react';

export default function MetricDetailsModal({ metric, onClose }) {
    if (!metric) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(5px)',
                    zIndex: 200,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.9, y: 20, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="neo-card"
                    style={{
                        width: '100%',
                        maxWidth: '500px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-default)',
                        overflow: 'hidden'
                    }}
                >
                    <div className="flex justify-between items-center p-lg border-b border-white/5">
                        <div className="flex items-center gap-md">
                            <div className={`p-2 rounded-lg bg-${metric.variant === 'success' ? 'emerald' : metric.variant === 'danger' ? 'ruby' : 'cyan'}-500/10 text-${metric.variant === 'success' ? 'emerald' : metric.variant === 'danger' ? 'ruby' : 'cyan'}-400`}>
                                {metric.icon && <metric.icon size={20} />}
                            </div>
                            <div>
                                <h3 className="text-title">{metric.label} Analysis</h3>
                                <p className="text-caption text-muted">Detailed performance breakdown</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="btn-icon">
                            <X size={20} className="text-muted" />
                        </button>
                    </div>

                    <div className="p-xl">
                        <div className="flex justify-between items-end mb-xl">
                            <div>
                                <p className="text-caption text-muted mb-xs uppercase tracking-wider">Current Value</p>
                                <h2 className="text-display" style={{ fontSize: '2.5rem' }}>
                                    {metric.prefix}{typeof metric.value === 'number' ? metric.value.toFixed(2) : metric.value}{metric.suffix}
                                </h2>
                            </div>
                            <div className={`flex items-center gap-xs px-2 py-1 rounded text-xs font-bold ${metric.variant === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-ruby-500/10 text-ruby-500'}`}>
                                {metric.variant === 'success' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                <span>+2.4% vs last week</span>
                            </div>
                        </div>

                        {/* Analysis Grid */}
                        <div className="grid grid-cols-2 gap-md mb-xl">
                            <div className="p-md rounded-lg bg-white/5 border border-white/5">
                                <p className="text-caption text-muted mb-1 flex items-center gap-1">
                                    <Activity size={12} /> Volatility
                                </p>
                                <p className="text-lg font-mono font-bold text-white">Low</p>
                            </div>
                            <div className="p-md rounded-lg bg-white/5 border border-white/5">
                                <p className="text-caption text-muted mb-1 flex items-center gap-1">
                                    <Calendar size={12} /> Period
                                </p>
                                <p className="text-lg font-mono font-bold text-white">Last 30 Days</p>
                            </div>
                        </div>

                        <div className="p-md rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-cyan-200 text-sm leading-relaxed">
                            <p>
                                <strong>AI Insight:</strong> Performance remains {metric.variant === 'success' ? 'strong' : 'stable'} with consistent growth observed in the Asian session. Recommended to maintain current risk parameters.
                            </p>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
