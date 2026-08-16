'use client';
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, AlertTriangle, Shield, Target, DollarSign, Crosshair, Zap, Divide, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useTradingStore } from '@/store';

export default function TradePanel({ currentPrice = null, symbol = 'EUR/USD', onExecute, tradingMode = 'paper', socket }) {
    const [lotSize, setLotSize] = useState(0.1);
    const [stopLoss, setStopLoss] = useState(20);
    const [takeProfit, setTakeProfit] = useState(40);
    const [riskPercent, setRiskPercent] = useState(1);
    const [isBuy, setIsBuy] = useState(true);
    const [assetClass, setAssetClass] = useState('FOREX');
    const [execState, setExecState] = useState('idle'); // idle | pending | success | error
    const [execResult, setExecResult] = useState(null);

    const lotPresets = [0.01, 0.05, 0.1, 0.5, 1.0];
    // Account balance from the tradingStore (broker status) — null until a real payload arrives.
    const accountBalance = useTradingStore((s) => s.accountBalance);

    const pipValue = lotSize * 10; // Simplified for major pairs
    const slValue = (stopLoss * pipValue).toFixed(2);
    const tpValue = (takeProfit * pipValue).toFixed(2);

    // Dynamic Accent Colors
    const accentColor = isBuy ? 'var(--acid-lime)' : 'var(--hyper-red)';
    const textAccent = isBuy ? 'text-[var(--acid-lime)]' : 'text-[var(--hyper-red)]';
    const borderAccent = isBuy ? 'border-[var(--acid-lime)]' : 'border-[var(--hyper-red)]';

    const handleExecuteClick = useCallback(() => {
        if (execState === 'pending') return;

        // Fail-closed: never place an order without a real market price.
        if (currentPrice == null) {
            setExecState('error');
            setExecResult({ reason: 'No live market tick yet — waiting for the cTrader price feed' });
            setTimeout(() => { setExecState('idle'); setExecResult(null); }, 3000);
            return;
        }

        setExecState('pending');
        setExecResult(null);

        const tradeData = {
            symbol: symbol,
            action: isBuy ? 'BUY' : 'SELL',
            volume: lotSize,
            price: currentPrice,
            sl: currentPrice - (isBuy ? stopLoss * 0.0001 : -stopLoss * 0.0001),
            tp: currentPrice + (isBuy ? takeProfit * 0.0001 : -takeProfit * 0.0001),
            stopLoss,
            takeProfit,
            lotSize,
            timestamp: new Date().toISOString(),
        };

        if (onExecute) {
            // Parent handles both paper and live execution
            onExecute(tradeData, (result) => {
                if (result && result.success) {
                    setExecState('success');
                    setExecResult(result);
                } else {
                    setExecState('error');
                    setExecResult(result || { reason: 'Execution failed' });
                }
                setTimeout(() => {
                    setExecState('idle');
                    setExecResult(null);
                }, 3000);
            });
        } else if (socket && socket.connected) {
            // Fallback: direct socket emit for live trading
            socket.emit('execute-trade', {
                symbol: symbol,
                action: isBuy ? 'BUY' : 'SELL',
                volume: lotSize,
                price: currentPrice,
                timestamp: new Date().toISOString()
            });

            socket.once('trade-executed', () => {
                setExecState('success');
                setTimeout(() => setExecState('idle'), 3000);
            });
            socket.once('trade-rejected', (data) => {
                setExecState('error');
                setExecResult(data);
                setTimeout(() => { setExecState('idle'); setExecResult(null); }, 3000);
            });
        } else {
            setExecState('error');
            setExecResult({ reason: 'No execution handler connected' });
            setTimeout(() => { setExecState('idle'); setExecResult(null); }, 3000);
        }
    }, [symbol, isBuy, lotSize, currentPrice, stopLoss, takeProfit, onExecute, socket, execState]);

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="panel-glass p-6 h-full flex flex-col relative overflow-hidden group"
        >
            {/* Background Decor */}
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <Crosshair size={120} strokeWidth={0.5} />
            </div>

            <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
                <div className={`p-2 rounded bg-white/5 ${textAccent}`}>
                    <Calculator size={20} />
                </div>
                <div>
                    <h3 className="text-xl font-display font-bold tracking-tight">Command Center</h3>
                    <p className="text-xs text-white/40 font-mono uppercase tracking-wider">Manual Execution</p>
                </div>
            </div>

            {/* Asset Class Selector */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-none">
                {['FOREX', 'CRYPTO', 'INDICES', 'SHARES'].map((type) => (
                    <button
                        key={type}
                        onClick={() => setAssetClass(type)}
                        className={`px-3 py-1 text-[10px] font-bold rounded border transition-all whitespace-nowrap ${assetClass === type
                                ? 'bg-white text-black border-white'
                                : 'bg-transparent text-white/40 border-white/10 hover:border-white/30'
                            }`}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {/* Direction Toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-lg mb-6 border border-white/5">
                <button
                    onClick={() => setIsBuy(true)}
                    className={`nav-btn py-3 rounded-md font-bold text-sm tracking-wide transition-all ${isBuy ? 'bg-[var(--acid-lime)] text-black shadow-[0_0_20px_rgba(204,255,0,0.3)]' : 'text-white/40 hover:text-white'
                        }`}
                >
                    BUY LONG
                </button>
                <button
                    onClick={() => setIsBuy(false)}
                    className={`nav-btn py-3 rounded-md font-bold text-sm tracking-wide transition-all ${!isBuy ? 'bg-[var(--hyper-red)] text-white shadow-[0_0_20px_rgba(255,15,66,0.3)]' : 'text-white/40 hover:text-white'
                        }`}
                >
                    SELL SHORT
                </button>
            </div>

            {/* Current Price Display */}
            <div className="mb-8 relative">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-xs text-white/40 font-mono uppercase">Market Price</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${currentPrice == null ? 'bg-amber-500/10 text-amber-400' : `${textAccent} bg-white/5`}`}>
                        {currentPrice == null ? 'AWAITING TICK' : 'LIVE'}
                    </span>
                </div>
                <div className="text-5xl font-mono font-bold tracking-tighter text-white tabular-nums">
                    {currentPrice == null ? '—' : currentPrice.toFixed(5)}
                </div>
                <div className={`h-px w-full mt-2 bg-gradient-to-r from-transparent via-white/20 to-transparent`} />
            </div>

            {/* Controls */}
            <div className="space-y-6 flex-1">
                {/* Lot Size */}
                <div>
                    <label className="flex justify-between text-xs text-white/60 mb-3 font-mono">
                        <span className="flex items-center gap-1"><DollarSign size={12} /> VOLUME (LOTS)</span>
                        <span className="text-white">{lotSize}</span>
                    </label>
                    <div className="grid grid-cols-5 gap-2 mb-3">
                        {lotPresets.map((preset) => (
                            <button
                                key={preset}
                                onClick={() => setLotSize(preset)}
                                className={`py-1.5 text-xs font-mono border rounded transition-all ${lotSize === preset
                                    ? `bg-white/10 text-white border-white/40`
                                    : 'border-white/5 text-white/30 hover:border-white/20'
                                    }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <input
                        type="range"
                        min="0.01"
                        max="5.0"
                        step="0.01"
                        value={lotSize}
                        onChange={(e) => setLotSize(parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:accent-[var(--acid-lime)] transition-all"
                    />
                </div>

                {/* SL / TP Inputs */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded bg-white/5 border border-white/5">
                        <label className="text-[10px] text-white/40 uppercase font-bold mb-1 block">Stop Loss (Pips)</label>
                        <input
                            type="number"
                            value={stopLoss}
                            onChange={(e) => setStopLoss(parseInt(e.target.value))}
                            className="bg-transparent text-xl font-mono font-bold text-white w-full outline-none border-b border-transparent focus:border-[var(--hyper-red)] transition-colors"
                        />
                        <div className="text-xs text-[var(--hyper-red)] mt-1 font-mono">-${slValue}</div>
                    </div>
                    <div className="p-3 rounded bg-white/5 border border-white/5">
                        <label className="text-[10px] text-white/40 uppercase font-bold mb-1 block">Take Profit (Pips)</label>
                        <input
                            type="number"
                            value={takeProfit}
                            onChange={(e) => setTakeProfit(parseInt(e.target.value))}
                            className="bg-transparent text-xl font-mono font-bold text-white w-full outline-none border-b border-transparent focus:border-[var(--acid-lime)] transition-colors"
                        />
                        <div className="text-xs text-[var(--acid-lime)] mt-1 font-mono">+${tpValue}</div>
                    </div>
                </div>

                {/* Risk Gauge */}
                <div className="p-4 rounded-lg bg-black/40 border border-white/5">
                    <div className="flex items-center gap-2 mb-3 text-xs text-amber-500/80">
                        <AlertTriangle size={12} />
                        <span className="uppercase font-bold tracking-wider">Risk Analysis</span>
                    </div>

                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-white/50">Risk/Reward Ratio</span>
                        <span className="font-mono text-white text-sm">1:{(takeProfit / stopLoss).toFixed(1)}</span>
                    </div>

                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden flex">
                        <div style={{ width: '30%' }} className="bg-[var(--hyper-red)] h-full" />
                        <div style={{ width: '70%' }} className="bg-[var(--acid-lime)] h-full" />
                    </div>
                    <div className="flex justify-between text-[10px] text-white/30 mt-1 font-mono">
                        <span>LOSS</span>
                        <span>PROFIT</span>
                    </div>
                </div>
            </div>

            {/* Execution Status Feedback */}
            <AnimatePresence>
                {execState !== 'idle' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
                            execState === 'pending' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                            execState === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                    >
                        {execState === 'pending' && <Loader2 size={16} className="animate-spin" />}
                        {execState === 'success' && <CheckCircle size={16} />}
                        {execState === 'error' && <XCircle size={16} />}
                        <span>
                            {execState === 'pending' && `${tradingMode === 'paper' ? 'Paper' : 'Live'} trade executing...`}
                            {execState === 'success' && `${tradingMode === 'paper' ? 'Paper' : 'Live'} order filled`}
                            {execState === 'error' && (execResult?.reason || 'Execution failed')}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Execute Button */}
            <motion.button
                whileHover={{ scale: execState === 'pending' || currentPrice == null ? 1 : 1.02 }}
                whileTap={{ scale: execState === 'pending' || currentPrice == null ? 1 : 0.98 }}
                onClick={handleExecuteClick}
                disabled={execState === 'pending' || currentPrice == null}
                className={`w-full py-4 mt-4 rounded-lg font-display font-bold text-lg tracking-widest flex items-center justify-center gap-3 transition-all ${
                    execState === 'pending' || currentPrice == null
                        ? 'bg-white/10 text-white/50 cursor-not-allowed'
                        : isBuy
                            ? 'bg-[var(--acid-lime)] text-black shadow-[0_0_40px_-10px_rgba(204,255,0,0.4)] hover:shadow-[0_0_60px_-10px_rgba(204,255,0,0.6)] cursor-pointer'
                            : 'bg-[var(--hyper-red)] text-white shadow-[0_0_40px_-10px_rgba(255,15,66,0.4)] hover:shadow-[0_0_60px_-10px_rgba(255,15,66,0.6)] cursor-pointer'
                }`}
            >
                {execState === 'pending' ? (
                    <Loader2 size={20} className="animate-spin" />
                ) : (
                    <Zap size={20} fill={isBuy ? 'currentColor' : 'white'} />
                )}
                {execState === 'pending' ? 'EXECUTING...' : `EXECUTE ${isBuy ? 'BUY' : 'SELL'}`}
            </motion.button>

            {/* Mode indicator */}
            <div className="mt-3 flex items-center justify-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${tradingMode === 'paper' ? 'bg-cyan-400' : 'bg-rose-500'}`} />
                <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">
                    {tradingMode === 'paper' ? 'Paper Mode — No Real Money' : 'Live Mode — Real Execution'}
                </span>
            </div>
            <div className="mt-1.5 flex items-center justify-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-white/25 font-mono">
                    Balance: {accountBalance != null ? `$${Number(accountBalance).toFixed(2)}` : '—'}
                </span>
            </div>
        </motion.div>
    );
}
