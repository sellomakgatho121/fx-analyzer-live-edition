/**
 * Paper Trading Engine
 * Simulates real trading without actual capital risk
 */

export class PaperTradingEngine {
    constructor(initialBalance = 10000) {
        this.initialBalance = initialBalance;
        this.balance = initialBalance;
        this.positions = [];
        this.history = [];
        this.allTrades = []; // flat chronological list of ALL trades (open + closed, manual + auto)
        this.equity = initialBalance;
    }

    /**
     * Get all trades (open positions + closed history) merged chronologically
     */
    getAllTrades() {
        return [...this.allTrades];
    }

    /**
     * Execute a paper trade
     * @param {object} signal - trade signal
     * @param {'manual'|'auto'} [signal.type] - 'manual' (from TradePanel) or 'auto' (from auto-trade)
     */
    executeTrade(signal) {
        const { symbol, action, price, lotSize, sl, tp, type } = signal;

        // Calculate position value and required margin
        const positionValue = lotSize * 100000 * price; // Standard lot = 100,000 units
        const leverage = 100; // 1:100 leverage
        const requiredMargin = positionValue / leverage;

        // Check if we have enough margin
        if (requiredMargin > this.balance) {
            return {
                success: false,
                reason: 'Insufficient margin',
                required: requiredMargin,
                available: this.balance
            };
        }

        // Apply realistic slippage (0.5-2 pips randomly)
        const slippagePips = Math.random() * 1.5 + 0.5;
        const slippage = slippagePips * 0.0001;
        const executionPrice = action === 'BUY'
            ? price + slippage
            : price - slippage;

        // Apply spread (typically 1-2 pips for majors)
        const spread = 0.0002;
        const finalPrice = action === 'BUY'
            ? executionPrice + spread / 2
            : executionPrice - spread / 2;

        // Create trade object
        const tradeType = type === 'auto' ? 'auto' : 'manual';

        const trade = {
            id: `PT${crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Date.now()}`,
            symbol,
            action,
            lotSize,
            entryPrice: finalPrice,
            sl,
            tp,
            openTime: new Date().toISOString(),
            status: 'open',
            type: tradeType, // 'manual' | 'auto'
            pips: 0,
            profit: 0,
            commission: lotSize * 7, // $7 per lot commission
            swap: 0 // Daily rollover (calculated on update)
        };

        this.positions.push(trade);
        this.allTrades.push(trade);
        this.balance -= requiredMargin;

        return {
            success: true,
            trade,
            slippagePips,
            executionPrice: finalPrice
        };
    }

    /**
     * Update all open positions with current market prices
     */
    updatePositions(currentPrices) {
        const now = new Date();

        this.positions.forEach(pos => {
            const currentPrice = currentPrices[pos.symbol];
            if (!currentPrice) return;

            // Calculate price difference
            const priceDiff = pos.action === 'BUY'
                ? currentPrice - pos.entryPrice
                : pos.entryPrice - currentPrice;

            // Calculate pips (4 decimal places for most pairs, 2 for JPY)
            const pipValue = pos.symbol.includes('JPY') ? 0.01 : 0.0001;
            pos.pips = priceDiff / pipValue;

            // Calculate profit
            pos.profit = (priceDiff * pos.lotSize * 100000) - pos.commission - pos.swap;

            // Calculate swap (overnight fee) - simplified
            const hoursOpen = (now - new Date(pos.openTime)) / (1000 * 60 * 60);
            if (hoursOpen > 24) {
                const daysOpen = Math.floor(hoursOpen / 24);
                pos.swap = daysOpen * pos.lotSize * 2; // $2 per lot per day
            }

            // Check Stop Loss
            const slHit = pos.action === 'BUY'
                ? currentPrice <= pos.sl
                : currentPrice >= pos.sl;

            // Check Take Profit
            const tpHit = pos.action === 'BUY'
                ? currentPrice >= pos.tp
                : currentPrice <= pos.tp;

            if (slHit) {
                this.closePosition(pos.id, pos.sl, 'Stop Loss Hit');
            } else if (tpHit) {
                this.closePosition(pos.id, pos.tp, 'Take Profit Hit');
            }
        });

        // Update equity (balance + unrealized P/L)
        const unrealizedPL = this.positions.reduce((sum, p) => sum + p.profit, 0);
        this.equity = this.balance + unrealizedPL;
    }

    /**
     * Close a position manually
     */
    closePosition(id, exitPrice, reason = 'Manual Close') {
        const posIndex = this.positions.findIndex(p => p.id === id);
        if (posIndex === -1) {
            return { success: false, reason: 'Position not found' };
        }

        const position = { ...this.positions[posIndex] };

        // Recalculate final P/L with exit price
        const priceDiff = position.action === 'BUY'
            ? exitPrice - position.entryPrice
            : position.entryPrice - exitPrice;

        const pipValue = position.symbol.includes('JPY') ? 0.01 : 0.0001;
        position.pips = priceDiff / pipValue;
        position.profit = (priceDiff * position.lotSize * 100000) - position.commission - position.swap;

        position.exitPrice = exitPrice;
        position.closeTime = new Date().toISOString();
        position.closeReason = reason;
        position.status = 'closed';

        // Release margin and add/subtract profit
        const positionValue = position.lotSize * 100000 * position.entryPrice;
        const releasedMargin = positionValue / 100;
        this.balance += releasedMargin + position.profit;

        // Update status in allTrades
        const allTradeIdx = this.allTrades.findIndex(t => t.id === id);
        if (allTradeIdx !== -1) {
            this.allTrades[allTradeIdx] = { ...position };
        }

        // Move to history
        this.history.push(position);
        this.positions.splice(posIndex, 1);

        // Update equity
        const unrealizedPL = this.positions.reduce((sum, p) => sum + p.profit, 0);
        this.equity = this.balance + unrealizedPL;

        return { success: true, position };
    }

    /**
     * Close all open positions
     */
    closeAllPositions(currentPrices) {
        const results = [];

        // Create a copy of positions array since we'll be modifying it
        const positionsToClose = [...this.positions];

        positionsToClose.forEach(pos => {
            const exitPrice = currentPrices[pos.symbol];
            if (exitPrice) {
                const result = this.closePosition(pos.id, exitPrice, 'Close All');
                results.push(result);
            }
        });

        return results;
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        const closedTrades = this.history;
        const winners = closedTrades.filter(t => t.profit > 0);
        const losers = closedTrades.filter(t => t.profit < 0);

        const totalProfit = closedTrades.reduce((sum, t) => sum + t.profit, 0);
        const grossProfit = winners.reduce((sum, t) => sum + t.profit, 0);
        const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.profit, 0));

        const avgWin = winners.length > 0
            ? grossProfit / winners.length
            : 0;
        const avgLoss = losers.length > 0
            ? grossLoss / losers.length
            : 0;

        return {
            // Account metrics
            initialBalance: this.initialBalance,
            balance: this.balance,
            equity: this.equity,
            profitLoss: this.balance - this.initialBalance,
            profitLossPercent: ((this.balance - this.initialBalance) / this.initialBalance) * 100,

            // Trade statistics
            totalTrades: closedTrades.length,
            winners: winners.length,
            losers: losers.length,
            winRate: closedTrades.length > 0
                ? (winners.length / closedTrades.length) * 100
                : 0,

            // Profit metrics
            totalProfit,
            grossProfit,
            grossLoss,
            avgWin,
            avgLoss,
            profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,

            // Current state
            openPositions: this.positions.length,
            unrealizedPL: this.positions.reduce((sum, p) => sum + p.profit, 0),
        };
    }

    /**
     * Get equity curve data points
     */
    getEquityCurve() {
        const points = [{ time: new Date(0).toISOString(), equity: this.initialBalance }];

        let runningEquity = this.initialBalance;

        this.history.forEach(trade => {
            runningEquity += trade.profit;
            points.push({
                time: trade.closeTime,
                equity: runningEquity
            });
        });

        // Add current equity point
        points.push({
            time: new Date().toISOString(),
            equity: this.equity
        });

        return points;
    }

    /**
     * Reset the paper trading account
     */
    reset() {
        this.balance = this.initialBalance;
        this.positions = [];
        this.history = [];
        this.allTrades = [];
        this.equity = this.initialBalance;
    }

    /**
     * Export account state for persistence
     */
    exportState() {
        return {
            initialBalance: this.initialBalance,
            balance: this.balance,
            positions: this.positions,
            history: this.history,
            allTrades: this.allTrades,
            equity: this.equity,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Import account state from persistence
     */
    importState(state) {
        this.initialBalance = state.initialBalance;
        this.balance = state.balance;

        // Sanitize positions - ensure unique IDs
        this.positions = (state.positions || []).map(pos => ({
            ...pos,
            id: (pos.id && pos.id !== '') ? pos.id : `PT${crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        }));

        // Sanitize history - ensure unique IDs
        this.history = (state.history || []).map(trade => ({
            ...trade,
            id: (trade.id && trade.id !== '') ? trade.id : `PT${crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        }));

        // Restore allTrades or reconstruct from positions + history
        this.allTrades = state.allTrades && state.allTrades.length > 0
            ? state.allTrades.map(t => ({
                ...t,
                id: (t.id && t.id !== '') ? t.id : `PT${crypto.randomUUID ? crypto.randomUUID().split('-')[0] : Date.now()}-${Math.random().toString(36).substr(2, 5)}`
            }))
            : [...this.positions, ...this.history];

        this.equity = state.equity;
    }
}

export default PaperTradingEngine;
