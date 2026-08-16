'use client';
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Bot,
    Settings2,
    Sliders,
    TrendingUp,
    Ban,
    AlertTriangle,
    Shield,
    DollarSign,
    ToggleLeft,
    ToggleRight,
} from 'lucide-react';

export default function AutoTradeSettings({
    isAutoTrading,
    onToggleAutoTrade,
    tradingMode,
    riskSettings,
    onUpdateRiskSettings,
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isPaper = tradingMode === 'paper';

    // Local sliders for risk params
    const [maxDailyTrades, setMaxDailyTrades] = useState(riskSettings?.maxDailyTrades || 5);
    const [maxRiskPercent, setMaxRiskPercent] = useState(riskSettings?.maxRiskPerTrade || 2);
    const [minConfidence, setMinConfidence] = useState(riskSettings?.minConfidence || 0.7);

    const handleRiskChange = useCallback((key, value) => {
        const newSettings = { ...riskSettings, [key]: value };
        if (key === 'maxDailyTrades') setMaxDailyTrades(value);
        if (key === 'maxRiskPerTrade') setMaxRiskPercent(value);
        if (key === 'minConfidence') setMinConfidence(value);
        onUpdateRiskSettings?.(newSettings);
    }, [riskSettings, onUpdateRiskSettings]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="panel-glass p-5"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${isAutoTrading ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
                        <Bot size={16} className={isAutoTrading ? 'text-emerald-400' : 'text-white/30'} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white tracking-tight">Auto-Trade Engine</h3>
                        <p className="text-[10px] text-white/40 font-mono">
                            {isPaper ? 'Paper Mode Execution' : 'Live Trading'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                        title="Settings"
                    >
                        <Settings2 size={14} />
                    </button>

                    {/* Master Toggle */}
                    <button
                        onClick={onToggleAutoTrade}
                        disabled={!isPaper}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                            !isPaper
                                ? 'bg-white/5 text-white/20 cursor-not-allowed'
                                : isAutoTrading
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/30'
                        }`}
                        title={!isPaper ? 'Auto-trade only available in Paper mode' : 'Toggle auto-trading'}
                    >
                        {isAutoTrading ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {isAutoTrading ? 'ON' : 'OFF'}
                    </button>
                </div>
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-2 mb-4">
                <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider ${
                    isAutoTrading
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                    {isAutoTrading ? '● Monitoring Signals' : '○ Standby'}
                </div>
                {!isPaper && (
                    <div className="flex items-center gap-1 text-[10px] text-rose-400/60 font-mono">
                        <Ban size={10} />
                        <span>Locked — Paper only</span>
                    </div>
                )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="py-2 px-3 bg-black/30 rounded-lg">
                    <p className="text-[10px] text-white/40 font-mono">Min Confidence</p>
                    <p className="text-sm font-bold font-mono text-white">{(minConfidence * 100).toFixed(0)}%</p>
                </div>
                <div className="py-2 px-3 bg-black/30 rounded-lg">
                    <p className="text-[10px] text-white/40 font-mono">Max Daily</p>
                    <p className="text-sm font-bold font-mono text-white">{maxDailyTrades} trades</p>
                </div>
            </div>

            {/* Expandable Settings */}
            {isExpanded && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="space-y-4 pt-3 border-t border-white/5"
                >
                    {/* Min Confidence Slider */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] font-mono text-white/50">Min Signal Confidence</span>
                            <span className="text-xs font-mono text-cyan-400 font-bold">{(minConfidence * 100).toFixed(0)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="0.95"
                            step="0.05"
                            value={minConfidence}
                            onChange={(e) => handleRiskChange('minConfidence', parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                        <div className="flex justify-between text-[9px] text-white/20 font-mono mt-0.5">
                            <span>50%</span>
                            <span>95%</span>
                        </div>
                    </div>

                    {/* Max Risk Per Trade */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] font-mono text-white/50">Max Risk / Trade</span>
                            <span className="text-xs font-mono text-amber-400 font-bold">{maxRiskPercent}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="5"
                            step="0.5"
                            value={maxRiskPercent}
                            onChange={(e) => handleRiskChange('maxRiskPerTrade', parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-400"
                        />
                        <div className="flex justify-between text-[9px] text-white/20 font-mono mt-0.5">
                            <span>0.5%</span>
                            <span>5%</span>
                        </div>
                    </div>

                    {/* Max Daily Trades */}
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] font-mono text-white/50">Max Daily Trades</span>
                            <span className="text-xs font-mono text-emerald-400 font-bold">{maxDailyTrades}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            step="1"
                            value={maxDailyTrades}
                            onChange={(e) => handleRiskChange('maxDailyTrades', parseInt(e.target.value))}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                        />
                        <div className="flex justify-between text-[9px] text-white/20 font-mono mt-0.5">
                            <span>1</span>
                            <span>20</span>
                        </div>
                    </div>

                    {/* Safety Notice */}
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                        <AlertTriangle size={12} className="text-amber-400/70 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-amber-400/60 font-mono leading-relaxed">
                            Auto-trading executes signals automatically when they meet confidence and risk thresholds.
                            {isPaper
                                ? ' All trades are simulated — no real money at risk.'
                                : ' Switch to Paper mode to use auto-trading.'}
                        </p>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
