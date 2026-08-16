export const CURRENCY_PAIRS = [
    // ═══════ MAJOR PAIRS ═══════
    { symbol: 'EURUSD', name: 'EUR/USD', base: 'EUR', quote: 'USD', category: 'major', pip: 0.0001 },
    { symbol: 'GBPUSD', name: 'GBP/USD', base: 'GBP', quote: 'USD', category: 'major', pip: 0.0001 },
    { symbol: 'USDJPY', name: 'USD/JPY', base: 'USD', quote: 'JPY', category: 'major', pip: 0.01 },
    { symbol: 'USDCHF', name: 'USD/CHF', base: 'USD', quote: 'CHF', category: 'major', pip: 0.0001 },
    { symbol: 'AUDUSD', name: 'AUD/USD', base: 'AUD', quote: 'USD', category: 'major', pip: 0.0001 },
    { symbol: 'USDCAD', name: 'USD/CAD', base: 'USD', quote: 'CAD', category: 'major', pip: 0.0001 },
    { symbol: 'NZDUSD', name: 'NZD/USD', base: 'NZD', quote: 'USD', category: 'major', pip: 0.0001 },

    // ═══════ CROSS PAIRS ═══════
    { symbol: 'EURGBP', name: 'EUR/GBP', base: 'EUR', quote: 'GBP', category: 'cross', pip: 0.0001 },
    { symbol: 'EURJPY', name: 'EUR/JPY', base: 'EUR', quote: 'JPY', category: 'cross', pip: 0.01 },
    { symbol: 'GBPJPY', name: 'GBP/JPY', base: 'GBP', quote: 'JPY', category: 'cross', pip: 0.01 },
    { symbol: 'EURCHF', name: 'EUR/CHF', base: 'EUR', quote: 'CHF', category: 'cross', pip: 0.0001 },
    { symbol: 'EURAUD', name: 'EUR/AUD', base: 'EUR', quote: 'AUD', category: 'cross', pip: 0.0001 },
    { symbol: 'EURCAD', name: 'EUR/CAD', base: 'EUR', quote: 'CAD', category: 'cross', pip: 0.0001 },
    { symbol: 'GBPCHF', name: 'GBP/CHF', base: 'GBP', quote: 'CHF', category: 'cross', pip: 0.0001 },
    { symbol: 'GBPAUD', name: 'GBP/AUD', base: 'GBP', quote: 'AUD', category: 'cross', pip: 0.0001 },
    { symbol: 'GBPCAD', name: 'GBP/CAD', base: 'GBP', quote: 'CAD', category: 'cross', pip: 0.0001 },
    { symbol: 'AUDCAD', name: 'AUD/CAD', base: 'AUD', quote: 'CAD', category: 'cross', pip: 0.0001 },
    { symbol: 'AUDNZD', name: 'AUD/NZD', base: 'AUD', quote: 'NZD', category: 'cross', pip: 0.0001 },
    { symbol: 'AUDJPY', name: 'AUD/JPY', base: 'AUD', quote: 'JPY', category: 'cross', pip: 0.01 },
    { symbol: 'NZDJPY', name: 'NZD/JPY', base: 'NZD', quote: 'JPY', category: 'cross', pip: 0.01 },
    { symbol: 'CADJPY', name: 'CAD/JPY', base: 'CAD', quote: 'JPY', category: 'cross', pip: 0.01 },
    { symbol: 'CHFJPY', name: 'CHF/JPY', base: 'CHF', quote: 'JPY', category: 'cross', pip: 0.01 },
    { symbol: 'EURNZD', name: 'EUR/NZD', base: 'EUR', quote: 'NZD', category: 'cross', pip: 0.0001 },
    { symbol: 'GBPNZD', name: 'GBP/NZD', base: 'GBP', quote: 'NZD', category: 'cross', pip: 0.0001 },
    { symbol: 'NZDCAD', name: 'NZD/CAD', base: 'NZD', quote: 'CAD', category: 'cross', pip: 0.0001 },
    { symbol: 'NZDCHF', name: 'NZD/CHF', base: 'NZD', quote: 'CHF', category: 'cross', pip: 0.0001 },
    { symbol: 'CADCHF', name: 'CAD/CHF', base: 'CAD', quote: 'CHF', category: 'cross', pip: 0.0001 },
    { symbol: 'AUDCHF', name: 'AUD/CHF', base: 'AUD', quote: 'CHF', category: 'cross', pip: 0.0001 },

    // ═══════ EXOTIC PAIRS ═══════
    { symbol: 'USDSGD', name: 'USD/SGD', base: 'USD', quote: 'SGD', category: 'exotic', pip: 0.0001 },
    { symbol: 'USDHKD', name: 'USD/HKD', base: 'USD', quote: 'HKD', category: 'exotic', pip: 0.0001 },
    { symbol: 'USDMXN', name: 'USD/MXN', base: 'USD', quote: 'MXN', category: 'exotic', pip: 0.0001 },
    { symbol: 'USDZAR', name: 'USD/ZAR', base: 'USD', quote: 'ZAR', category: 'exotic', pip: 0.0001 },
    { symbol: 'USDTRY', name: 'USD/TRY', base: 'USD', quote: 'TRY', category: 'exotic', pip: 0.0001 },
    { symbol: 'USDNOK', name: 'USD/NOK', base: 'USD', quote: 'NOK', category: 'exotic', pip: 0.0001 },
    { symbol: 'USDSEK', name: 'USD/SEK', base: 'USD', quote: 'SEK', category: 'exotic', pip: 0.0001 },
    { symbol: 'USDPLN', name: 'USD/PLN', base: 'USD', quote: 'PLN', category: 'exotic', pip: 0.0001 },
    { symbol: 'EURTRY', name: 'EUR/TRY', base: 'EUR', quote: 'TRY', category: 'exotic', pip: 0.0001 },
    { symbol: 'EURNOK', name: 'EUR/NOK', base: 'EUR', quote: 'NOK', category: 'exotic', pip: 0.0001 },
    { symbol: 'EURSEK', name: 'EUR/SEK', base: 'EUR', quote: 'SEK', category: 'exotic', pip: 0.0001 },

    // ═══════ COMMODITIES ═══════
    { symbol: 'XAUUSD', name: 'XAU/USD', base: 'XAU', quote: 'USD', category: 'commodity', pip: 0.01, displayName: 'Gold' },
    { symbol: 'XAGUSD', name: 'XAG/USD', base: 'XAG', quote: 'USD', category: 'commodity', pip: 0.001, displayName: 'Silver' },
    { symbol: 'XPTUSD', name: 'XPT/USD', base: 'XPT', quote: 'USD', category: 'commodity', pip: 0.01, displayName: 'Platinum' },
    { symbol: 'XPDUSD', name: 'XPD/USD', base: 'XPD', quote: 'USD', category: 'commodity', pip: 0.01, displayName: 'Palladium' },
    { symbol: 'XTIUSD', name: 'XTI/USD', base: 'XTI', quote: 'USD', category: 'commodity', pip: 0.01, displayName: 'Crude Oil WTI' },
    { symbol: 'XBRUSD', name: 'XBR/USD', base: 'XBR', quote: 'USD', category: 'commodity', pip: 0.01, displayName: 'Brent Crude' },
    { symbol: 'XNGUSD', name: 'XNG/USD', base: 'XNG', quote: 'USD', category: 'commodity', pip: 0.001, displayName: 'Natural Gas' },
    { symbol: 'XCUUSD', name: 'XCU/USD', base: 'XCU', quote: 'USD', category: 'commodity', pip: 0.001, displayName: 'Copper' },

    // ═══════ INDICES (CFD) ═══════
    { symbol: 'US30', name: 'US30', base: 'US30', quote: 'USD', category: 'index', pip: 1, displayName: 'Dow Jones 30' },
    { symbol: 'US500', name: 'US500', base: 'US500', quote: 'USD', category: 'index', pip: 0.1, displayName: 'S&P 500' },
    { symbol: 'NAS100', name: 'NAS100', base: 'NAS100', quote: 'USD', category: 'index', pip: 0.1, displayName: 'Nasdaq 100' },
    { symbol: 'UK100', name: 'UK100', base: 'UK100', quote: 'GBP', category: 'index', pip: 0.1, displayName: 'FTSE 100' },
    { symbol: 'GER40', name: 'GER40', base: 'GER40', quote: 'EUR', category: 'index', pip: 0.1, displayName: 'DAX 40' },
    { symbol: 'JPN225', name: 'JPN225', base: 'JPN225', quote: 'JPY', category: 'index', pip: 1, displayName: 'Nikkei 225' },
];

export const CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'major', label: 'Major' },
    { id: 'cross', label: 'Cross' },
    { id: 'exotic', label: 'Exotic' },
    { id: 'commodity', label: 'Commodities' },
    { id: 'index', label: 'Indices' },
];

export const getPairBySymbol = (symbol) => {
    return CURRENCY_PAIRS.find(pair => pair.symbol === symbol || pair.name === symbol);
};

export const getPairsByCategory = (category) => {
    if (category === 'all') return CURRENCY_PAIRS;
    return CURRENCY_PAIRS.filter(pair => pair.category === category);
};

export const formatPrice = (price, symbol) => {
    const pair = getPairBySymbol(symbol);
    if (!pair) return parseFloat(price).toFixed(5);

    if (pair.category === 'index') {
        return parseFloat(price).toFixed(pair.pip >= 1 ? 0 : 1);
    }
    if (pair.category === 'commodity') {
        return parseFloat(price).toFixed(pair.pip === 0.01 ? 2 : 3);
    }

    const decimals = pair.pip === 0.01 ? 2 : 5;
    return parseFloat(price).toFixed(decimals);
};

export const getDisplayName = (pair) => {
    return pair.displayName || pair.name;
};
