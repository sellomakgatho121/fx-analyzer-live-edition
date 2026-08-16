'use client';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, RefreshCcw } from 'lucide-react';
import socketEventBus from '@/lib/socketEventBus';

/**
 * TickerBar — renders live prices from the shared socket bus.
 * ticker-update carries an array of { symbol, price, change, positive,
 * source?, ts? }. `source` ('engine' | 'mock') is additive: 'engine' ticks
 * come from the live cTrader feed, 'mock' marks dry-run data. With no data
 * for 10s the bar reports the feed as unavailable.
 */
export default function TickerBar({ liveData = [] }) {
  const [streamData, setStreamData] = useState([]);
  const [stale, setStale] = useState(false);

  // Subscribe to the shared bus (matches the useSocket/event-bus idiom) so the
  // bar is live even when rendered without props.
  useEffect(() => {
    const unsubscribe = socketEventBus.on('ticker-update', (data) => {
      setStreamData(Array.isArray(data) ? data : []);
    });
    return unsubscribe;
  }, []);

  const data = streamData.length > 0 ? streamData : liveData;
  // Duplicate more times to ensure smooth infinite scroll on wide screens
  const doubledData = data.length > 0 ? [...data, ...data, ...data, ...data] : [];

  // After 10s with no ticker data at all, surface an honest unavailable state
  // instead of an endless "awaiting" message.
  useEffect(() => {
    if (data.length > 0) {
      setStale(false);
      return undefined;
    }
    const t = setTimeout(() => setStale(true), 10000);
    return () => clearTimeout(t);
  }, [data.length]);

  // Source indicator: any mock ticker => degraded; all engine => live;
  // no data at all for 10s => unavailable (stale).
  const anyMock = data.some((item) => item?.source === 'mock');
  const sourceKnown = data.some((item) => item?.source === 'engine' || item?.source === 'mock');
  const dotColor = anyMock ? '#ffd700' : sourceKnown ? '#84cc16' : stale ? '#ef4444' : '#94a3b8';

  return (
    <div className="w-full h-12 bg-black/60 backdrop-blur-md border-b border-white/5 flex items-center overflow-hidden relative z-50">
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black via-black/80 to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black via-black/80 to-transparent z-10" />

      <div className="flex items-center gap-2 px-4 border-r border-white/10 shrink-0 z-20 bg-black/40">
        <div className="relative">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: dotColor }} />
          <div className="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-75" style={{ background: dotColor }} />
        </div>
        <span className="text-xs font-mono font-bold text-white/80 tracking-widest">LIVE_MARKET</span>
        {anyMock && (
          <span
            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255, 215, 0, 0.12)', color: '#ffd700' }}
          >
            DEGRADED
          </span>
        )}
      </div>

      {data.length === 0 ? (
        <div className={`flex items-center px-4 text-xs font-mono ${stale ? 'text-amber-400' : 'text-white/30'}`}>
          {stale ? 'MARKET DATA UNAVAILABLE — engine feed offline' : 'Awaiting market data from the engine…'}
        </div>
      ) : (
        <div className="flex overflow-hidden w-full mask-linear-fade">
          <motion.div
            className="flex items-center gap-8 px-4"
            animate={{ x: [0, -1000] }} // Simplified calculation for demo
            transition={{ ease: "linear", duration: 30, repeat: Infinity }}
            style={{ width: 'max-content' }}
          >
            {doubledData.map((item, index) => (
              <div
                key={`${item.symbol}-${index}`}
                className="flex items-center gap-3 group cursor-pointer"
              >
                <span className="font-display font-bold text-sm text-white/90 group-hover:text-white transition-colors">
                  {item.symbol}
                </span>
                <span className="font-mono text-sm text-white/60">{item.price}</span>
                <span className={`text-xs font-bold flex items-center gap-1 ${item.positive ? 'text-lime-400' : 'text-red-500'}`}>
                  {item.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {item.change}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
