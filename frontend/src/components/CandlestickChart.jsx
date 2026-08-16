'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, ColorType, CrosshairMode, createSeriesMarkers } from 'lightweight-charts';

// Convert trade entry to lightweight-charts marker
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

function updateTradeMarkers(markersPlugin, trades) {
    if (!markersPlugin) return;
    try {
        markersPlugin.setMarkers(tradesToMarkers(trades));
    } catch (e) {
        console.warn('Failed to update trade markers:', e);
    }
}

const timeframes = [
    { label: '1M', minutes: 1 },
    { label: '5M', minutes: 5 },
    { label: '15M', minutes: 15 },
    { label: '1H', minutes: 60 },
    { label: '4H', minutes: 240 },
    { label: '1D', minutes: 1440 },
];

export default function CandlestickChart({ symbol = 'EUR/USD', livePrice = null, onPriceUpdate, trades = [] }) {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const candleSeriesRef = useRef(null);
    const markersPluginRef = useRef(null);
    const candleDataRef = useRef([]);
    const [activeTimeframe, setActiveTimeframe] = useState('15M');
    const [currentPrice, setCurrentPrice] = useState(null);
    const [dataSource, setDataSource] = useState('loading'); // 'live' | 'mock' | 'loading'

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Create chart with new v5 API
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

        // Add candlestick series using new v5 unified API
        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#ccff00',      // var(--acid-lime)
            downColor: '#ff0f42',    // var(--hyper-red)
            borderUpColor: '#ccff00',
            borderDownColor: '#ff0f42',
            wickUpColor: '#ccff00',
            wickDownColor: '#ff0f42',
        });

        candleSeriesRef.current = candleSeries;

        // Fit content
        chart.timeScale().fitContent();

        // Initial markers plugin (lightweight-charts v5: markers are a
        // series plugin created via createSeriesMarkers)
        markersPluginRef.current = createSeriesMarkers(candleSeries, tradesToMarkers(trades));

        // Handle resize
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
        };
    }, [activeTimeframe, onPriceUpdate]);

    // Load real candle history from the engine data feed (backend /api/candles).
    // Reloads when the pair or timeframe changes.
    useEffect(() => {
        let cancelled = false;
        setDataSource('loading');
        const rawSymbol = symbol.replace('/', '');
        fetch(`/api/candles/${rawSymbol}?limit=150`)
            .then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error(`HTTP ${resp.status}`))))
            .then((data) => {
                if (cancelled) return;
                const candles = (data.candles || []).map((c) => ({
                    time: c.time,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                }));
                if (candles.length === 0) return;
                candleDataRef.current = candles;
                candleSeriesRef.current?.setData(candles);
                chartRef.current?.timeScale().fitContent();
                setDataSource(data.source === 'mock' ? 'mock' : 'live');
                const last = candles[candles.length - 1];
                setCurrentPrice(last.close);
                onPriceUpdate?.(last.close);
            })
            .catch((e) => {
                console.error('Failed to load candles:', e);
                setDataSource('mock');
            });
        return () => { cancelled = true; };
    }, [symbol, activeTimeframe, onPriceUpdate]);

    // Live tick updates: extend the last candle with the real-time price
    useEffect(() => {
        if (livePrice == null) return;
        const series = candleSeriesRef.current;
        const data = candleDataRef.current;
        if (!series || data.length === 0) return;
        const last = data[data.length - 1];
        const updated = {
            ...last,
            close: livePrice,
            high: Math.max(last.high, livePrice),
            low: Math.min(last.low, livePrice),
        };
        data[data.length - 1] = updated;
        series.update(updated);
        setCurrentPrice(livePrice);
        onPriceUpdate?.(livePrice);
    }, [livePrice, onPriceUpdate]);

    // Separate effect to update trade markers without recreating chart
    useEffect(() => {
        if (markersPluginRef.current) {
            updateTradeMarkers(markersPluginRef.current, trades);
        }
    }, [trades]);

    return (
        <div className="chart-container">
            <div className="chart-header">
                <div className="flex items-center gap-md">
                    <h3 className="text-title">{symbol}</h3>
                    {currentPrice && (
                        <span className="text-mono text-cyan" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                            {currentPrice.toFixed(5)}
                        </span>
                    )}
                    <span
                        className="text-caption"
                        style={{
                            color: dataSource === 'live' ? 'var(--neon-emerald)' : 'var(--text-muted)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '2px 6px',
                            fontSize: '0.65rem',
                        }}
                    >
                        {dataSource === 'loading' ? 'LOADING' : dataSource.toUpperCase()}
                    </span>
                </div>
                <div className="chart-timeframes">
                    {timeframes.map((tf) => (
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
            <div className="chart-body" ref={chartContainerRef} />
        </div>
    );
}
