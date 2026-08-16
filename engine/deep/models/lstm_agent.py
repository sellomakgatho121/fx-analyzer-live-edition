"""LSTM time-series forecasting agent.

Implements a 2-layer LSTM for next-day price direction classification.
References from awesome-deep-trading: CS229 LSTM (Stanford), CEEMD+LSTM, Deep Stock Predictions.
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

import torch
import torch.nn as nn
import torch.optim as optim

from engine.deep.base import DeepAgent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# PyTorch model
# ---------------------------------------------------------------------------

class _LSTMNet(nn.Module):
    def __init__(self, input_dim: int = 5, hidden_dim: int = 128, num_layers: int = 2):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True, dropout=0.2)
        self.fc = nn.Linear(hidden_dim, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(x)
        last = out[:, -1, :]  # take last timestep
        return torch.sigmoid(self.fc(last)).squeeze(-1)


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def _compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.rolling(period, min_periods=period).mean()
    avg_loss = loss.rolling(period, min_periods=period).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    return 100 - (100 / (1 + rs))


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a DataFrame with engineered columns aligned to df index."""
    feats = pd.DataFrame(index=df.index)
    feats["ret_1"] = df["Close"].pct_change()
    feats["ret_5"] = df["Close"].pct_change(5)
    feats["vol_ratio"] = df["Volume"] / df["Volume"].rolling(20).mean()
    feats["rsi"] = _compute_rsi(df["Close"])
    feats["bb_pct"] = _bb_position(df["Close"])
    feats["atr"] = _atr(df)
    feats["target"] = (df["Close"].shift(-1) > df["Close"]).astype(int)
    return feats.dropna()


def _bb_position(close: pd.Series, period: int = 20) -> pd.Series:
    sma = close.rolling(period).mean()
    std = close.rolling(period).std()
    return (close - sma) / (2 * std + 1e-9)


def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high_low = df["High"] - df["Low"]
    high_close = (df["High"] - df["Close"].shift()).abs()
    low_close = (df["Low"] - df["Close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return tr.rolling(period).mean()


# ---------------------------------------------------------------------------
# LSTM Agent
# ---------------------------------------------------------------------------

class LSTMTradingAgent(DeepAgent):
    """LSTM-based next-day direction predictor.

    Caches one model per symbol in-memory.  On first call for a symbol,
    trains on the most recent 2 years of daily data.
    """

    SEQ_LEN = 60
    INPUT_DIM = 6
    HIDDEN_DIM = 128
    NUM_LAYERS = 2
    TRAIN_EPOCHS = 25
    BATCH_SIZE = 32
    LR = 1e-3

    def __init__(self) -> None:
        super().__init__("lstm_trading_agent")
        self._executor = ThreadPoolExecutor(max_workers=1)
        self._models: dict[str, _LSTMNet] = {}       # symbol -> trained net
        self._model_lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # DeepAgent hooks
    # ------------------------------------------------------------------

    async def _load_impl(self) -> bool:
        # Nothing global to load; models are created per-symbol.
        return True

    async def _analyze_impl(self, symbol: str, context: dict[str, Any]) -> dict[str, Any]:
        df = await asyncio.get_event_loop().run_in_executor(
            self._executor, _fetch_data, symbol
        )
        if df is None or len(df) < self.SEQ_LEN + 10:
            return {
                "error": f"Insufficient data for {symbol}",
                "confidence": 0.0,
                "signal": "neutral",
                "report": f"Not enough price history for {symbol} to run LSTM analysis.",
            }

        feats = _build_features(df)
        if len(feats) < self.SEQ_LEN + 2:
            return {
                "error": "Too few samples after feature engineering",
                "confidence": 0.0,
                "signal": "neutral",
                "report": f"Insufficient feature rows ({len(feats)}) for {symbol}.",
            }

        model = await self._get_or_train(symbol, feats)
        latest_seq = _last_sequence(feats, self.SEQ_LEN)
        model.eval()
        with torch.no_grad():
            inp = torch.from_numpy(latest_seq).unsqueeze(0).float()
            prob = model(inp).item()

        signal = "bullish" if prob > 0.6 else ("bearish" if prob < 0.4 else "neutral")
        last_close = float(df["Close"].iloc[-1])
        price_target = last_close * (1 + (prob - 0.5) * 0.04)

        # Simple feature attribution: perturb each feature
        fi = _feature_importance(model, latest_seq)

        report = (
            f"## LSTM Trend Analysis — {symbol}\n\n"
            f"**Prediction**: {signal.upper()} (confidence {prob:.1%})\n"
            f"**Last Close**: ${last_close:.2f}\n"
            f"**Price Target (1d)**: ${price_target:.2f}\n\n"
            f"**Model State**: {'Trained' if symbol in self._models else 'Untrained'}\n"
            f"**Sequence Length**: {self.SEQ_LEN} days\n"
            f"**Features Used**: return_1d, return_5d, volume_ratio, RSI, BB%, ATR\n\n"
            f"**Feature Importance**:\n" + "\n".join(f"  - {k}: {v:.3f}" for k, v in fi.items()) + "\n\n"
        )

        return {
            "report": report,
            "confidence": round(prob, 4),
            "signal": signal,
            "price_target": round(price_target, 2),
            "features": fi,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_or_train(self, symbol: str, feats: pd.DataFrame) -> _LSTMNet:
        async with self._model_lock:
            if symbol in self._models:
                return self._models[symbol]

            logger.info("Training LSTM model for %s on %d samples…", symbol, len(feats))
            model = await asyncio.get_event_loop().run_in_executor(
                self._executor, _train_model, feats, self.SEQ_LEN,
                self.INPUT_DIM, self.HIDDEN_DIM, self.NUM_LAYERS,
                self.TRAIN_EPOCHS, self.BATCH_SIZE, self.LR,
            )
            self._models[symbol] = model
            return model


# ---------------------------------------------------------------------------
# Standalone helpers (run in thread pool to avoid blocking the event loop)
# ---------------------------------------------------------------------------

def _fetch_data(symbol: str) -> pd.DataFrame | None:
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="2y")
        if df.empty or len(df) < 100:
            return None
        return df
    except Exception as exc:
        logger.warning("yfinance fetch failed for %s: %s", symbol, exc)
        return None


def _last_sequence(feats: pd.DataFrame, seq_len: int) -> np.ndarray:
    cols = ["ret_1", "ret_5", "vol_ratio", "rsi", "bb_pct", "atr"]
    data = feats[cols].values[-seq_len:]
    # Normalise per-column
    mean = data.mean(axis=0, keepdims=True)
    std = data.std(axis=0, keepdims=True) + 1e-8
    return (data - mean) / std


def _train_model(
    feats: pd.DataFrame,
    seq_len: int,
    input_dim: int,
    hidden_dim: int,
    num_layers: int,
    epochs: int,
    batch_size: int,
    lr: float,
) -> _LSTMNet:
    cols = ["ret_1", "ret_5", "vol_ratio", "rsi", "bb_pct", "atr"]
    data = feats[cols].values
    targets = feats["target"].values

    # Build sequences
    X, y = [], []
    for i in range(len(data) - seq_len):
        seq = data[i : i + seq_len]
        # Normalise per-sequence
        m = seq.mean(axis=0, keepdims=True)
        s = seq.std(axis=0, keepdims=True) + 1e-8
        X.append((seq - m) / s)
        y.append(targets[i + seq_len])

    X_t = torch.tensor(np.stack(X)).float()
    y_t = torch.tensor(np.array(y)).float()

    dataset = torch.utils.data.TensorDataset(X_t, y_t)
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=True)

    model = _LSTMNet(input_dim, hidden_dim, num_layers)
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)

    model.train()
    for epoch in range(epochs):
        epoch_loss = 0.0
        for batch_x, batch_y in loader:
            optimizer.zero_grad()
            pred = model(batch_x)
            loss = criterion(pred, batch_y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
        if (epoch + 1) % 10 == 0:
            logger.info("  LSTM epoch %d/%d loss=%.4f", epoch + 1, epochs, epoch_loss)

    return model


def _feature_importance(model: _LSTMNet, seq: np.ndarray) -> dict[str, float]:
    """Perturb each feature column in the last timestep to estimate importance."""
    cols = ["ret_1", "ret_5", "vol_ratio", "rsi", "bb_pct", "atr"]
    base_inp = torch.from_numpy(seq).unsqueeze(0).float()
    model.eval()
    with torch.no_grad():
        base_prob = model(base_inp).item()

    importance = {}
    for i, name in enumerate(cols):
        perturbed = base_inp.clone()
        perturbed[0, -1, i] += 0.5  # shift by 0.5 std
        with torch.no_grad():
            p = model(perturbed).item()
        importance[name] = abs(p - base_prob)

    total = sum(importance.values()) or 1.0
    return {k: v / total for k, v in importance.items()}
