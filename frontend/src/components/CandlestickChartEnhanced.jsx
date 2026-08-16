'use client';
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  createSeriesMarkers,
} from 'lightweight-charts';
import {
  BrainCircuit,
  Sigma,
  TrendingUp,
  TrendingDown,
  WifiOff,
} from 'lucide-react';
import useUIStore from '@/store/uiStore';

const TIMEFRAMES = [
  { label: '1M', minutes: 1 },
  { label: '5M', minutes: 5 },
  { label: '15M', minutes: 15 },
  { label: '1H', minutes: 60 },
  { label: '4H', minutes: 240 },
  { label: '1D', minutes: 1440 },
];

function generateLSTMProjection(candles, priceTarget, confidence) {
  if (!candles || candles.length === 0) return [];
  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle.close;
  const targetPrice = priceTarget || lastPrice * 1.002;
  // Generate 12 future candles with confidence-based cone
  const projection = [];
  for (let i = 1; i <= 12; i++) {
    const projectedTime = lastCandle.time + i * 3600; // 1h intervals
    const progress = i / 12;
    const projectedPrice = lastPrice + (targetPrice - lastPrice) * progress;
    // Add noise representing prediction uncertainty (scales with distance)
    const uncertainty = (1 - confidence) * 0.002 * i;
    projection.push({
      time: projectedTime,
      value: parseFloat(
        (projectedPrice + (Math.random() - 0.5) * uncertainty).toFixed(5)
      ),
    });
  }
  return projection;
}

function generatePatternMarkers(candles, pattern, confidence) {
  if (!candles || candles.length === 0 || !pattern) return [];
  // Place pattern marker near the last few candles
  const markerIdx = Math.min(candles.length - 5, Math.floor(candles.length * 0.8));
  const markerCandle = candles[markerIdx];
  const isBullish = ['double_bottom', 'inverse_head_and_shoulders', 'ascending_triangle', 'bull_flag', 'wedge'].includes(pattern);
  return [{
    time: markerCandle.time,
    position: isBullish ? 'belowBar' : 'aboveBar',
    color: isBullish ? 'var(--agent-cnn)' : 'var(--hyper-red)',
    shape: isBullish ? 'arrowUp' : 'arrowDown',
    text: `${pattern} (${(confidence * 100).toFixed(0)}%)`,
    size: 2,
  }];
}

function tradesToMarkers(trades) {
  if (!trades || trades.length === 0) return [];
  return trades
    .filter(t => t.entryPrice && t.openTime)
    .map(t => {
      const time = Math.floor(new Date(t.openTime).getTime() / 1000);
      const isBuy = t.action === 'BUY';
      return {
        time,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? '#ccff00' : '#ff0f42',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: `${isBuy ? 'B' : 'S'} ${t.lotSize?.toFixed(2) || ''}`,
      };
    });
}

export default function CandlestickChartEnhanced({
  symbol, // optional override — falls back to the active pair in uiStore
  onPriceUpdate,
  trades = [],
  lstmData = null,
  cnnData = null,
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const lstmLineRef = useRef(null);
  const markersPluginRef = useRef(null);
  const candleDataRef = useRef([]);
  const [activeTimeframe, setActiveTimeframe] = useState('15M');
  const [currentPrice, setCurrentPrice] = useState(null);
  const [showLSTM, setShowLSTM] = useState(true);
  const [showPatterns, setShowPatterns] = useState(true);
  const [dataState, setDataState] = useState('loading'); // 'loading' | 'live' | 'degraded'

  const activePair = useUIStore((s) => s.activePair);
  const resolvedSymbol = symbol || activePair?.name || 'EUR/USD';

  // Chart lifecycle — no mock seed, no random-walk interval.
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b8b9a',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(0, 242, 255, 0.3)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#0d0d12',
        },
        horzLine: {
          color: 'rgba(0, 242, 255, 0.3)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#0d0d12',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.05)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ccff00',
      downColor: '#ff0f42',
      borderUpColor: '#ccff00',
      borderDownColor: '#ff0f42',
      wickUpColor: '#ccff00',
      wickDownColor: '#ff0f42',
    });
    candleSeriesRef.current = candleSeries;

    // LSTM projection line
    const lstmLine = chart.addSeries(LineSeries, {
      color: 'var(--agent-lstm, #ff6b9d)',
      lineStyle: 2, // Dashed
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      title: 'LSTM Projection',
    });
    lstmLineRef.current = lstmLine;

    // Fit content
    chart.timeScale().fitContent();

    // Initial markers plugin (lightweight-charts v5: markers are a
    // series plugin created via createSeriesMarkers)
    markersPluginRef.current = createSeriesMarkers(candleSeries, tradesToMarkers(trades));

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lstmLineRef.current = null;
      markersPluginRef.current = null;
    };
  }, [activeTimeframe]);

  // Real candles from the engine feed (/api/candles/:symbol, same-origin).
  // Never fabricate candles: on a failed fetch or a mock
  // payload we show a degraded empty state instead of simulated data.
  // Reloads when the pair or the selected timeframe changes.
  useEffect(() => {
    let cancelled = false;
    setDataState('loading');
    const rawSymbol = resolvedSymbol.replace('/', '');
    fetch(`/api/candles/${rawSymbol}?limit=150`)
      .then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error(`HTTP ${resp.status}`))))
      .then((data) => {
        if (cancelled) return;
        const isMock = data?.source === 'mock' || data?.mock === true;
        const candles = (data?.candles || [])
          .filter((c) => c && c.time != null)
          .map((c) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));

        if (isMock || candles.length === 0) {
          // Degraded — the engine has no real candles for this pair yet.
          candleDataRef.current = [];
          candleSeriesRef.current?.setData([]);
          setCurrentPrice(null);
          setDataState('degraded');
          return;
        }

        candleDataRef.current = candles;
        candleSeriesRef.current?.setData(candles);
        chartRef.current?.timeScale().fitContent();
        setDataState('live');
        const last = candles[candles.length - 1];
        setCurrentPrice(last.close);
        onPriceUpdate?.(last.close);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('Failed to load candles:', e);
        candleDataRef.current = [];
        candleSeriesRef.current?.setData([]);
        setCurrentPrice(null);
        setDataState('degraded');
      });

    return () => { cancelled = true; };
  }, [resolvedSymbol, activeTimeframe, onPriceUpdate]);

  // Update LSTM projection overlay
  useEffect(() => {
    if (!lstmLineRef.current) return;
    if (showLSTM && lstmData && candleDataRef.current.length > 0) {
      const projection = generateLSTMProjection(
        candleDataRef.current,
        lstmData.price_target,
        lstmData.confidence || 0.7
      );
      lstmLineRef.current.setData(projection);
      lstmLineRef.current.applyOptions({ visible: true });
    } else {
      lstmLineRef.current.applyOptions({ visible: false });
    }
  }, [lstmData, showLSTM]);

  // Update trade markers
  useEffect(() => {
    if (candleSeriesRef.current) {
      const allMarkers = tradesToMarkers(trades);
      // Add pattern markers if visible
      if (showPatterns && cnnData?.pattern) {
        const patternMarkers = generatePatternMarkers(
          candleDataRef.current,
          cnnData.pattern,
          cnnData.confidence
        );
        allMarkers.push(...patternMarkers);
      }
      markersPluginRef.current?.setMarkers(allMarkers);
    }
  }, [trades, cnnData, showPatterns]);

  return (
    <div className="chart-container">
      {/* Chart Header */}
      <div className="chart-header">
        <div className="flex items-center gap-md">
          <h3 className="text-title">{resolvedSymbol}</h3>
          {currentPrice && (
            <span
              className="text-mono text-cyan"
              style={{ fontSize: '1.25rem', fontWeight: 700 }}
            >
              {currentPrice.toFixed(5)}
            </span>
          )}
          <span
            className="text-caption"
            style={{
              color: dataState === 'live' ? 'var(--neon-emerald)' : dataState === 'degraded' ? 'var(--neon-gold)' : 'var(--text-muted)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              fontSize: '0.65rem',
            }}
          >
            {dataState === 'loading' ? 'LOADING' : dataState === 'live' ? 'LIVE' : 'DEGRADED'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* LSTM toggle */}
          <button
            onClick={() => setShowLSTM(!showLSTM)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded border transition-all"
            style={{
              border: `1px solid ${showLSTM ? 'var(--agent-lstm, #ff6b9d)' : 'var(--border-subtle)'}`,
              color: showLSTM ? 'var(--agent-lstm, #ff6b9d)' : 'var(--text-muted)',
              background: showLSTM ? 'rgba(255, 107, 157, 0.08)' : 'transparent',
            }}
          >
            <BrainCircuit size={12} />
            LSTM
          </button>

          {/* Pattern toggle */}
          <button
            onClick={() => setShowPatterns(!showPatterns)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded border transition-all"
            style={{
              border: `1px solid ${showPatterns ? 'var(--agent-cnn, #fbbf24)' : 'var(--border-subtle)'}`,
              color: showPatterns ? 'var(--agent-cnn, #fbbf24)' : 'var(--text-muted)',
              background: showPatterns ? 'rgba(251, 191, 36, 0.08)' : 'transparent',
            }}
          >
            <Sigma size={12} />
            Patterns
          </button>

          {/* Timeframes */}
          <div className="flex gap-1 ml-2">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.label}
                className={`timeframe-btn ${activeTimeframe === tf.label ? 'active' : ''}`}
                onClick={() => setActiveTimeframe(tf.label)}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active Overlays Legend */}
      {(showLSTM && lstmData) || (showPatterns && cnnData) ? (
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-white/5">
          {showLSTM && lstmData && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-0.5 rounded" style={{ background: 'var(--agent-lstm, #ff6b9d)' }} />
              <span className="text-[10px] font-mono" style={{ color: 'var(--agent-lstm, #ff6b9d)' }}>
                LSTM: {(lstmData.signal || 'neutral').toUpperCase()} @ {(lstmData.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
          {showPatterns && cnnData && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-0.5 rounded" style={{ background: 'var(--agent-cnn, #fbbf24)' }} />
              <span className="text-[10px] font-mono" style={{ color: 'var(--agent-cnn, #fbbf24)' }}>
                Pattern: {cnnData.pattern} @ {(cnnData.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      ) : null}

      {/* Chart Body */}
      <div className="chart-body" style={{ position: 'relative' }} ref={chartContainerRef}>
        {dataState === 'degraded' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'rgba(9, 13, 22, 0.55)',
              backdropFilter: 'blur(2px)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <WifiOff size={22} style={{ color: 'var(--text-muted)', opacity: 0.7 }} />
            <p className="text-caption text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
              Live candle feed unavailable
            </p>
            <p className="text-caption" style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)' }}>
              No simulated candles — waiting for the engine feed
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
