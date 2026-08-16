import ta
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, EMAIndicator
from ta.volatility import BollingerBands

class TechnicalAnalyzer:
    """
    Performs technical analysis on OHLCV data using the 'ta' library.
    Compatible with Python 3.13 (Pure Python).
    """
    
    def __init__(self):
        pass

    def analyze(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Applies technical indicators to the DataFrame.
        Expects columns: ['time', 'open', 'high', 'low', 'close', 'tick_volume']
        """
        if df.empty:
            return df
        
        # Ensure correct types
        df['close'] = df['close'].astype(float)
        
        # RSI (14 period)
        rsi_ind = RSIIndicator(close=df['close'], window=14)
        df['RSI'] = rsi_ind.rsi()
        
        # MACD (12, 26, 9)
        macd = MACD(close=df['close'], window_slow=26, window_fast=12, window_sign=9)
        df['MACD_12_26_9'] = macd.macd()
        df['MACDs_12_26_9'] = macd.macd_signal()
        df['MACDh_12_26_9'] = macd.macd_diff()
            
        # Bollinger Bands (20, 2)
        bb_ind = BollingerBands(close=df['close'], window=20, window_dev=2)
        df['BBL_20_2.0'] = bb_ind.bollinger_lband()
        df['BBM_20_2.0'] = bb_ind.bollinger_mavg()
        df['BBU_20_2.0'] = bb_ind.bollinger_hband()

        # EMA Trends
        ema_50 = EMAIndicator(close=df['close'], window=50)
        df['EMA_50'] = ema_50.ema_indicator()
        
        ema_200 = EMAIndicator(close=df['close'], window=200)
        df['EMA_200'] = ema_200.ema_indicator()

        return df

    def check_signals(self, df: pd.DataFrame, symbol: str) -> dict:
        """
        Checks for buy/sell signals based on the latest analyzed data.
        """
        if df.empty or 'RSI' not in df.columns or df['RSI'].iloc[-1] is None:
            return None

        last_row = df.iloc[-1]
        
        # Handle NaN values at start of data series
        if pd.isna(last_row['RSI']):
            return None
        
        signal = None
        confidence = 0.0
        reasoning = []

        # RSI Logic
        rsi = float(last_row['RSI'])
        if rsi < 30:
            reasoning.append(f"RSI Oversold ({rsi:.1f})")
            confidence += 0.3
            # Potential BUY
            if signal is None: signal = 'BUY'
            elif signal == 'SELL': signal = None # Conflict
            
        elif rsi > 70:
            reasoning.append(f"RSI Overbought ({rsi:.1f})")
            confidence += 0.3
            # Potential SELL
            if signal is None: signal = 'SELL'
            elif signal == 'BUY': signal = None # Conflict

        # EMA Trend Logic - Only check if EMAs are calculated (not NaN)
        if not pd.isna(last_row['EMA_50']) and not pd.isna(last_row['EMA_200']):
            ema_50 = float(last_row['EMA_50'])
            ema_200 = float(last_row['EMA_200'])
            close = float(last_row['close'])
            
            if close > ema_50 > ema_200:
                reasoning.append("Price above EMA 50 & 200 (Bullish Trend)")
                if signal == 'BUY': confidence += 0.2
            elif close < ema_50 < ema_200:
                 reasoning.append("Price below EMA 50 & 200 (Bearish Trend)")
                 if signal == 'SELL': confidence += 0.2

        if signal and confidence >= 0.3:
            return {
                "symbol": symbol,
                "action": signal,
                "confidence": min(confidence + 0.2, 0.99), # Base boost
                "price": float(last_row['close']),
                "ai_reasoning": " + ".join(reasoning),
                "timestamp": str(last_row['time']) if 'time' in last_row else None
            }
            
        return None

    def analyze_daily(self, df: pd.DataFrame) -> dict:
        """
        Performs a simplified D1 trend analysis.
        """
        if df.empty or len(df) < 50:
            return None

        last_row = df.iloc[-1]
        
        # Simple Trend based on EMA 50
        ema_50 = last_row.get('EMA_50')
        close = last_row.get('close')
        
        trend = "NEUTRAL"
        if ema_50 and close:
            if close > ema_50: trend = "BULLISH"
            elif close < ema_50: trend = "BEARISH"

        return {
            "trend": trend,
            "rsi": round(float(last_row.get('RSI', 50)), 1),
            "price": float(close)
        }

    def get_technical_summary(self, df: pd.DataFrame, symbol: str) -> dict:
        """
        Extracts raw technical metrics for the TechnicalAgent.
        """
        if df.empty: return {}
        last = df.iloc[-1]
        
        # Determine Trend
        ema50 = last.get('EMA_50')
        ema200 = last.get('EMA_200')
        close = last.get('close')
        trend = "Neutral"
        if ema50 and ema200:
            if close > ema50 > ema200: trend = "Strong Uptrend"
            elif close < ema50 < ema200: trend = "Strong Downtrend"
            elif close > ema50: trend = "Uptrend"
            elif close < ema50: trend = "Downtrend"
            
        return {
            "symbol": symbol,
            "price": float(close),
            "rsi": round(float(last.get('RSI', 50)), 2),
            "macd": round(float(last.get('MACD_12_26_9', 0)), 4),
            "trend": trend,
            "bb_status": "Upper Band Break" if close > last.get('BBU_20_2.0', 999999) else "Lower Band Break" if close < last.get('BBL_20_2.0', 0) else "Within Bands",
            "atr": 0.0010 # Placeholder
        }
