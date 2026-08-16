'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, AlertTriangle, ChevronDown, ChevronUp, Zap, Radio, Target } from 'lucide-react';

import { useRouter } from 'next/navigation';
import VerificationBadge from './VerificationBadge';
import AgentDebate from './AgentDebate';

export default function SignalCard({ signal, onExecute }) {
    const router = useRouter();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [isExecuted, setIsExecuted] = useState(false);
    const [showBreakdown, setShowBreakdown] = useState(false);

    const isBuy = signal.action === 'BUY';
    const accentColor = isBuy ? 'var(--acid-lime)' : 'var(--hyper-red)';
    const confidencePercent = Math.round(signal.confidence * 100);

    const handleExecute = async () => {
        setIsExecuting(true);
        await new Promise(resolve => setTimeout(resolve, 1500));
        setIsExecuting(false);
        setIsExecuted(true);
        onExecute?.(signal);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:shadow-[0_0_30px_-5px_var(--shadow-color)] cursor-pointer"
            style={{ '--shadow-color': accentColor }}
            onClick={(e) => {
                // Ignore clicks on buttons to prevents conflict
                if (e.target.closest('button')) return;
                setIsExpanded(!isExpanded);
            }}
        >
            {/* Holographic Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(transparent_0%,_var(--accent)_50%,_transparent_100%)] bg-[length:100%_200%] animate-scanline"
                style={{ '--accent': accentColor, animationDuration: '3s' }} />

            <div className="relative z-10 p-5">
                {/* Header: Symbol, Price & Verification */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="absolute inset-0 bg-current blur-md opacity-40 rounded-full" style={{ color: accentColor }} />
                                <div className="relative bg-black/80 p-2.5 rounded-lg border border-white/10 text-white">
                                    {isBuy ? <TrendingUp size={20} style={{ color: accentColor }} /> : <TrendingDown size={20} style={{ color: accentColor }} />}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-2xl font-bold tracking-tight font-display">{signal.symbol}</h3>
                                    <span className={`px-2 py-0.5 text-xs font-mono font-bold rounded-full ${isBuy ? 'bg-lime-400/10 text-lime-400' : 'bg-red-500/10 text-red-500'}`}>
                                        {signal.action}
                                    </span>
                                </div>
                                <p className="text-xs text-white/40 font-mono tracking-wider flex items-center gap-1 mt-1">
                                    <Activity size={10} />
                                    {new Date(signal.timestamp).toLocaleTimeString()}
                                </p>
                            </div>
                        </div>
                        {/* Verification Badge */}
                        {signal.verification && (
                            <div className="mt-1">
                                <VerificationBadge verification={signal.verification} />
                            </div>
                        )}
                    </div>

                    <div className="text-right">
                        <div className="text-3xl font-bold font-mono tracking-tight" style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}40` }}>
                            {signal.price}
                        </div>
                        <div className="flex items-center justify-end gap-1 text-xs text-white/50 font-mono">
                            <Target size={10} />
                            <span>TP: {signal.takeProfit || '---'}</span>
                        </div>
                    </div>
                </div>

                {/* Confidence Bar */}
                <div className="mb-4">
                    <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1.5 font-mono">
                        <span>AI Confidence</span>
                        <span style={{ color: accentColor }}>{confidencePercent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${confidencePercent}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full relative overflow-hidden"
                            style={{ background: accentColor, boxShadow: `0 0 10px ${accentColor}` }}
                        >
                            <div className="absolute inset-0 bg-white/30 w-full h-full animate-shimmer" />
                        </motion.div>
                    </div>
                </div>

                {/* Expandable Analysis */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-3 mb-4 rounded-lg bg-white/5 border border-white/5 text-sm text-white/70 leading-relaxed font-light">
                                <p className="mb-2"><span className="text-white font-medium">Analysis:</span> {signal.ai_reasoning}</p>

                                <AgentDebate breakdown={signal.agent_breakdown} />

                                {signal.risk_factors && (
                                    <div className="flex items-start gap-2 mt-2 text-amber-400/90 text-xs bg-amber-500/10 p-2 rounded">
                                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                        <span>{signal.risk_factors}</span>
                                    </div>
                                )}

                                {/* Verification Breakdown */}
                                {signal.verification && (
                                    <div className="mt-3 pt-3 border-t border-white/5">
                                        <p className="text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">Verification Score Breakdown</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {Object.entries(signal.verification.breakdown).map(([key, value]) => (
                                                <div key={key} className="flex justify-between items-center text-xs">
                                                    <span className="capitalize text-white/60">{key}</span>
                                                    <span className="font-mono font-medium" style={{ color: value > 10 ? 'var(--neon-emerald)' : 'var(--text-muted)' }}>
                                                        +{value}
                                                    </span>
                                                </div>
                                            ))}
                                            <div className="col-span-2 mt-1 pt-1 border-t border-white/5 flex justify-between items-center bg-white/5 p-1.5 rounded">
                                                <span className="font-bold text-white">Total Score</span>
                                                <span className="font-bold font-mono text-emerald-400">{signal.verification.score}/100</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Actions */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-3">
                    <button
                        onClick={handleExecute}
                        disabled={isExecuting || isExecuted}
                        className="relative group/btn overflow-hidden rounded-lg font-bold text-sm tracking-wide transition-all border disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            borderColor: isExecuted ? 'var(--steel-grey)' : accentColor,
                            color: isExecuted ? 'var(--text-dim)' : '#000',
                            background: isExecuted ? 'transparent' : accentColor
                        }}
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
                        <div className="relative py-3 flex items-center justify-center gap-2">
                            {isExecuting ? (
                                <Zap size={16} className="animate-pulse" />
                            ) : isExecuted ? (
                                <Radio size={16} />
                            ) : (
                                <Zap size={16} />
                            )}
                            {isExecuting ? 'EXECUTING...' : isExecuted ? 'FILLED' : 'EXECUTE'}
                        </div>
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/signals?id=${signal.id}`);
                        }}
                        className="px-4 border border-white/10 rounded-lg hover:bg-white/5 hover:border-white/20 transition-colors text-white font-mono text-xs font-bold tracking-wider flex items-center"
                    >
                        DETAILS
                    </button>

                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="px-3 border border-white/10 rounded-lg hover:bg-white/5 hover:border-white/20 transition-colors text-white/60"
                    >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
