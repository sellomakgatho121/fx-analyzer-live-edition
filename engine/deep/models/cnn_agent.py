"""CNN chart-pattern detection agent.

Detects technical chart patterns (head & shoulders, double top/bottom,
flags, triangles) from OHLCV data using a 1D convolutional neural network.

References from awesome-deep-trading: Pattern Detection with CNNs,
Deep Learning for Chart Pattern Recognition (Chen & Jolley).
"""

from __future__ import annotations

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# torch is a heavy dependency with no py3.14/aarch64 wheel; the agent must
# degrade cleanly (report "not loaded") instead of crashing the engine import.
try:
    import torch  # noqa: F401
    import torch.nn as nn
    import torch.optim as optim
    TORCH_AVAILABLE = True
except ImportError:
    torch = nn = optim = None
    TORCH_AVAILABLE = False
    logger.warning("torch not available — CNNPatternAgent will be disabled")

from engine.deep.base import DeepAgent

# Known chart pattern labels the CNN is trained to recognise.
PATTERN_LABELS = [
    "head_and_shoulders",
    "inverse_head_and_shoulders",
    "double_top",
    "double_bottom",
    "ascending_triangle",
    "descending_triangle",
    "bull_flag",
    "bear_flag",
    "wedge",
    "no_pattern",
]

# ---------------------------------------------------------------------------
# PyTorch 1D CNN
# ---------------------------------------------------------------------------


if TORCH_AVAILABLE:
    class _ChartCNN(nn.Module):
        """1D convolutional network for time-series pattern recognition.

        Architecture:
          Conv1D(6→32, k=5) → ReLU → MaxPool(2)
          Conv1D(32→64, k=3) → ReLU → MaxPool(2)
          Conv1D(64→64, k=3) → ReLU → GlobalAvgPool
          Dropout(0.3) → Linear(64 → len(PATTERN_LABELS))
        """

        def __init__(self, n_classes: int = len(PATTERN_LABELS)):
            super().__init__()
            self.conv1 = nn.Conv1d(in_channels=6, out_channels=32, kernel_size=5, padding=2)
            self.relu = nn.ReLU()
            self.pool = nn.MaxPool1d(2)
            self.conv2 = nn.Conv1d(32, 64, kernel_size=3, padding=1)
            self.conv3 = nn.Conv1d(64, 64, kernel_size=3, padding=1)
            self.dropout = nn.Dropout(0.3)
            self.fc = nn.Linear(64, n_classes)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            # x shape: (batch, channels=6, seq_len)
            x = self.pool(self.relu(self.conv1(x)))
            x = self.pool(self.relu(self.conv2(x)))
            x = self.relu(self.conv3(x))
            # Global average pool over sequence dimension
            x = x.mean(dim=-1)  # (batch, 64)
            x = self.dropout(x)
            return self.fc(x)  # (batch, n_classes) — raw logits


# ---------------------------------------------------------------------------
# Feature builder – normalised OHLCV + volume
# ---------------------------------------------------------------------------


def _build_chart_features(df: pd.DataFrame, seq_len: int = 120) -> np.ndarray | None:
    """Extract a normalised (seq_len, 6) array from OHLCV data.

    Channels: Open, High, Low, Close, Volume (log), SMA-20 ratio.
    All channels are z-score normalised per-window for scale invariance.
    """
    if len(df) < seq_len:
        return None

    ohlcv = df[["Open", "High", "Low", "Close", "Volume"]].values[-seq_len:].copy()
    # Log-volume
    ohlcv[:, 4] = np.log1p(ohlcv[:, 4])
    # SMA ratio channel
    sma20 = pd.Series(df["Close"].values).rolling(20).mean().values[-seq_len:]
    sma_ratio = (ohlcv[:, 3] / np.where(sma20 > 1e-8, sma20, 1e-8)) - 1.0
    features = np.column_stack([ohlcv, sma_ratio])  # (seq_len, 6)

    # Per-channel z-score
    mean = features.mean(axis=0, keepdims=True)
    std = features.std(axis=0, keepdims=True) + 1e-8
    return ((features - mean) / std).astype(np.float32)


# ---------------------------------------------------------------------------
# Synthetic pattern generator for training
# ---------------------------------------------------------------------------


def _generate_synthetic_pattern(seq_len: int = 120) -> tuple[np.ndarray, int]:
    """Generate a synthetic OHLCV window with a random pattern label.

    Returns (features, label_index). Used to bootstrap the CNN when no
    labelled historical data is available.
    """
    # Base random walk with trend
    t = np.linspace(0, 4 * np.pi, seq_len)
    close = 100 + np.cumsum(np.random.randn(seq_len) * 0.5) + np.sin(t) * 2

    pattern = np.random.randint(0, len(PATTERN_LABELS) - 1)  # exclude no_pattern

    if pattern == 0:  # head_and_shoulders
        # Three peaks with middle higher
        mid = seq_len // 2
        shoulder_h = 5
        head_h = 12
        close[mid - 15 : mid - 5] += shoulder_h
        close[mid - 5 : mid + 5] += head_h
        close[mid + 5 : mid + 15] += shoulder_h
    elif pattern == 1:  # inverse_head_and_shoulders
        mid = seq_len // 2
        shoulder_h = -5
        head_h = -12
        close[mid - 15 : mid - 5] += shoulder_h
        close[mid - 5 : mid + 5] += head_h
        close[mid + 5 : mid + 15] += shoulder_h
    elif pattern == 2:  # double_top
        gap = seq_len // 3
        close[gap - 5 : gap + 5] += 10
        close[2 * gap - 5 : 2 * gap + 5] += 10
    elif pattern == 3:  # double_bottom
        gap = seq_len // 3
        close[gap - 5 : gap + 5] -= 10
        close[2 * gap - 5 : 2 * gap + 5] -= 10
    elif pattern == 4:  # ascending_triangle
        close += np.linspace(0, 8, seq_len)
        noise = np.random.randn(seq_len) * 2
        close += noise
    elif pattern == 5:  # descending_triangle
        close -= np.linspace(0, 8, seq_len)
        noise = np.random.randn(seq_len) * 2
        close += noise
    elif pattern == 6:  # bull_flag
        mid = seq_len // 2
        close[:mid] += np.linspace(0, 15, mid)
        close[mid:] += 15 + np.random.randn(seq_len - mid) * 1.5
    elif pattern == 7:  # bear_flag
        mid = seq_len // 2
        close[:mid] -= np.linspace(0, 15, mid)
        close[mid:] += -15 + np.random.randn(seq_len - mid) * 1.5
    elif pattern == 8:  # wedge
        close += np.linspace(0, 6, seq_len) * np.sin(t * 0.5)

    # Build OHLCV around the close
    vol = np.random.uniform(0.5, 2.0, seq_len) * 1e6
    ohlcv = np.column_stack([
        close - np.random.uniform(0.1, 0.5, seq_len),  # Open ≈ Close
        close + np.random.uniform(0.2, 0.8, seq_len),  # High
        close - np.random.uniform(0.2, 0.8, seq_len),  # Low
        close,
        vol,
    ])

    # Build feature array
    sma20_vals = pd.Series(close).rolling(20, min_periods=1).mean().values
    sma_ratio = (close / np.where(sma20_vals > 1e-8, sma20_vals, 1e-8)) - 1.0
    features = np.column_stack([ohlcv, sma_ratio])

    mean = features.mean(axis=0, keepdims=True)
    std = features.std(axis=0, keepdims=True) + 1e-8
    return ((features - mean) / std).astype(np.float32), pattern


# ---------------------------------------------------------------------------
# Real-data trend labeling (T2)
# ---------------------------------------------------------------------------

REAL_TRAIN_SYMBOLS = [
    "BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "US500", "US30",
]


def _local_extrema(vals, order, cmp):
    """Return (index, value) tuples where vals[i] is a local max/min.

    Collapses plateaus (runs of equal extrema) to their middle point.
    """
    n = len(vals)
    out = []
    for i in range(order, n - order):
        if vals[i] == cmp(vals[i - order : i + order + 1]):
            out.append((i, float(vals[i])))
    if not out:
        return out
    # Merge a plateau's entries: same level AND near each other. Distinct
    # peaks with equal values (true double tops) stay separate because
    # their indices are far apart.
    collapsed = []
    for idx, val in out:
        prev_idx, prev_val = collapsed[-1] if collapsed else (None, None)
        if (
            prev_val is not None
            and abs(val - prev_val) <= 0.15 * abs(val)
            and idx - prev_idx <= 3 * order
        ):
            collapsed[-1] = [idx, val]  # advance to plateau end
        else:
            collapsed.append([idx, val])
    return [(i, v) for i, v in collapsed]


def _auto_label_window(close: np.ndarray) -> int:
    """Deterministically label a real price window with a structural class.

    Mirrors the synthetic generator's semantics (strong directed pole with
    a flat body = flag; equal peaks/troughs = double top/bottom; a dominant
    extreme over smaller shoulders = head & shoulders; plain drift =
    triangle; opposing legs = wedge) so labels are consistent with the
    CNN's PATTERN_LABELS vocabulary.
    """
    n = len(close)
    y = np.asarray(close, dtype=float) / (np.asarray(close, dtype=float).mean() + 1e-9)
    half = n // 2
    s1 = (y[half] - y[0]) / max(half, 1)       # first-half drift (flag pole)
    s2 = (y[-1] - y[half]) / max(n - half, 1)  # second-half drift (flag body)
    total = y[-1] - y[0]

    # Bull/bear flags: strong pole, flat body
    if s1 > 0 and abs(s2) < 0.25 * abs(s1) and total > 0.03:
        return 6  # bull_flag
    if s1 < 0 and abs(s2) < 0.25 * abs(s1) and total < -0.03:
        return 7  # bear_flag

    # Plain trends → triangles
    if s1 > 1.5e-4 and s2 > 1.5e-4:
        return 4  # ascending_triangle
    if s1 < -1.5e-4 and s2 < -1.5e-4:
        return 5  # descending_triangle

    # Irregulars: local extrema on the detrended window
    order = 3
    x = np.arange(n)
    detr = y - np.polyval(np.polyfit(x, y, 1), x)
    peaks = _local_extrema(detr, order, np.max)
    troughs = _local_extrema(detr, order, np.min)

    # Head & shoulders / inverse: dominant extreme, smaller side extremes
    if peaks:
        hi = max(peaks, key=lambda t: t[1])
        side_peaks = [p for p in peaks if abs(p[0] - hi[0]) > 3 * order]
        if hi[1] > 0.02 and side_peaks and max(p[1] for p in side_peaks) < 0.5 * hi[1]:
            return 0  # head_and_shoulders
    if troughs:
        lo = min(troughs, key=lambda t: t[1])
        side_troughs = [t for t in troughs if abs(t[0] - lo[0]) > 3 * order]
        if lo[1] < -0.02 and side_troughs and min(t[1] for t in side_troughs) > 0.5 * lo[1]:
            return 1  # inverse_head_and_shoulders

    # Double top / bottom: two equal extrema with a counter-move between
    def _double(ext, sign):
        if len(ext) < 2:
            return None
        top = sorted(ext, key=lambda t: t[1] * sign, reverse=True)[:2]
        a, b = top
        if abs(a[1] * sign) < 0.015 or b[1] * sign < 0.5 * a[1] * sign:
            return None
        lo, hi_i = sorted((a[0], b[0]))
        if hi_i - lo <= 2 * order:
            return None
        between = detr[lo + order : hi_i - order]
        if len(between) == 0:
            return None
        if sign > 0 and between.min() < a[1] * 0.6:  # valley dips between peaks
            return 2  # double_top
        if sign < 0 and between.max() > a[1] * 0.6:  # ridge between troughs
            return 3  # double_bottom
        return None

    dbl = _double(peaks, +1)
    if dbl is not None:
        return dbl
    dbl = _double(troughs, -1)
    if dbl is not None:
        return dbl

    # Wedge: two opposing, non-trivial legs (last — structure has priority)
    if s1 * s2 < 0 and min(abs(s1), abs(s2)) > 5e-5:
        return 8  # wedge

    return 9  # no_pattern


def _build_real_training_set(
    seq_len: int,
    symbols: list[str] | None = None,
    max_per_label: int = 400,
    fetch_func=None,
) -> tuple[list[np.ndarray], list[int], dict[str, int]]:
    """Slide labeled windows over real OHLCV history (no synthetic data).

    Each (seq_len, 6) feature window is structurally labeled by
    ``_auto_label_window``, then z-scored exactly like inference windows.
    Returns (features, labels, {label_name: count}) — or (None, None, {})
    when no real data could be fetched.
    """
    symbols = symbols or REAL_TRAIN_SYMBOLS
    windows: list[tuple[np.ndarray, int]] = []
    if fetch_func is None:
        from research_data import _timed_session
        session = _timed_session()
        fetch_func = lambda sym: _fetch_cnn_data(sym, session=session)  # noqa: E731

    counts: dict[int, int] = {i: 0 for i in range(len(PATTERN_LABELS))}
    for sym in symbols:
        df = fetch_func(sym)
        if df is None or len(df) < seq_len + 5:
            logger.warning("CNN training: no real data for %s", sym)
            continue
        close = df["Close"].to_numpy(dtype=float)
        for i in range(0, len(df) - seq_len, seq_len // 3):  # overlapping stride
            label = _auto_label_window(close[i : i + seq_len])
            if counts[label] >= max_per_label:
                continue
            window = df.iloc[i : i + seq_len][["Open", "High", "Low", "Close", "Volume"]]
            feats = _build_chart_features(window, seq_len)
            if feats is None:
                continue
            windows.append((feats, label))
            counts[label] += 1

    if not windows:
        return None, None, {}
    X_list = [w[0] for w in windows]
    y_list = [w[1] for w in windows]
    logger.info(
        "CNN training set: %d real windows %s",
        len(windows),
        {PATTERN_LABELS[i]: c for i, c in counts.items() if c},
    )
    return X_list, y_list, {PATTERN_LABELS[i]: c for i, c in counts.items() if c}


# ---------------------------------------------------------------------------
# Training routine
# ---------------------------------------------------------------------------


def _train_cnn(
    seq_len: int,
    n_classes: int,
    n_synthetic: int = 5000,
    epochs: int = 30,
    batch_size: int = 64,
    lr: float = 1e-3,
    real_data: tuple[list[np.ndarray], list[int]] | None = None,
    checkpoint_path: str | None = None,
) -> tuple[_ChartCNN, str]:
    """Train a _ChartCNN.

    With ``real_data=(X_list, y_list)`` (real, trend-labeled history) the
    synthetic generator is skipped entirely. Returns (model, source_label)
    where source_label is "real" or "synthetic".
    """
    if real_data is not None:
        X_list, y_list = real_data
        source = "real"
        logger.info("Training CNN on %d REAL trend-labeled windows…", len(X_list))
    else:
        logger.info("Generating %d synthetic training samples…", n_synthetic)
        X_list, y_list = [], []
        for _ in range(n_synthetic):
            feats, label = _generate_synthetic_pattern(seq_len)
            X_list.append(feats)  # (seq_len, 6)
            y_list.append(label)
        source = "synthetic"

    # Transpose for Conv1D: (batch, channels, seq_len)
    X = torch.tensor(np.stack(X_list)).permute(0, 2, 1).float()
    y = torch.tensor(np.array(y_list)).long()

    dataset = torch.utils.data.TensorDataset(X, y)
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=True)

    model = _ChartCNN(n_classes)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)

    model.train()
    for epoch in range(epochs):
        epoch_loss = 0.0
        correct = 0
        total = 0
        for batch_x, batch_y in loader:
            optimizer.zero_grad()
            logits = model(batch_x)
            loss = criterion(logits, batch_y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
            preds = logits.argmax(dim=1)
            correct += (preds == batch_y).sum().item()
            total += batch_y.size(0)
        acc = correct / total * 100
        if (epoch + 1) % 10 == 0:
            logger.info("  CNN epoch %d/%d loss=%.4f acc=%.1f%%", epoch + 1, epochs, epoch_loss, acc)

    if checkpoint_path:
        try:
            os.makedirs(os.path.dirname(checkpoint_path), exist_ok=True)
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "trained_on": source,
                    "n_samples": len(X_list),
                },
                checkpoint_path,
            )
            logger.info("CNN checkpoint saved: %s (%s, %d samples)", checkpoint_path, source, len(X_list))
        except Exception as exc:
            logger.error("CNN checkpoint save failed: %s", exc)

    return model, source


def _cnn_inference(
    model: _ChartCNN,
    features: np.ndarray,
) -> tuple[str, float]:
    """Run inference on a single (seq_len, 6) sample.

    Returns (predicted_pattern, confidence).
    """
    model.eval()
    # Add batch + transpose: (1, 6, seq_len)
    inp = torch.from_numpy(features).unsqueeze(0).permute(0, 2, 1).float()
    with torch.no_grad():
        logits = model(inp)  # (1, n_classes)
        probs = torch.softmax(logits, dim=1).squeeze(0)
        pred_idx = probs.argmax().item()
        confidence = probs[pred_idx].item()
    return PATTERN_LABELS[pred_idx], confidence


# ---------------------------------------------------------------------------
# Rule-based pattern confirmation (heuristic fallback)
# ---------------------------------------------------------------------------


def _rule_based_patterns(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Simple rule-based pattern detection as a lightweight check.

    Returns a list of pattern dicts with ``name`` and ``confidence``.
    These are used to augment the CNN output, not replace it.
    """
    patterns: list[dict[str, Any]] = []
    close = df["Close"].values
    high = df["High"].values
    low = df["Low"].values
    n = len(close)

    if n < 50:
        return patterns

    # --- Double top: two peaks within 5% with a valley in between ---
    half = n // 2
    left_peak = float(np.max(high[:half]))
    right_peak = float(np.max(high[half:]))
    if abs(left_peak / right_peak - 1) < 0.03 and left_peak > 0:
        valley = float(np.min(low[half // 2 : half + half // 2]))
        if valley / left_peak < 0.97:
            patterns.append({"name": "potential_double_top", "confidence": 0.4})

    # --- Double bottom ---
    left_trough = float(np.min(low[:half]))
    right_trough = float(np.min(low[half:]))
    if abs(left_trough / right_trough - 1) < 0.03 and left_trough > 0:
        peak_valley = float(np.max(high[half // 2 : half + half // 2]))
        if left_trough / peak_valley < 0.97:
            patterns.append({"name": "potential_double_bottom", "confidence": 0.4})

    # --- Bull flag: sharp rise then consolidation ---
    leg1 = close[n // 3] - close[0]
    leg2 = close[-1] - close[n // 3]
    if leg1 > 0 and abs(leg2) < abs(leg1) * 0.3:
        patterns.append({"name": "potential_bull_flag", "confidence": 0.35})

    # --- Bear flag: sharp drop then consolidation ---
    if leg1 < 0 and abs(leg2) < abs(leg1) * 0.3:
        patterns.append({"name": "potential_bear_flag", "confidence": 0.35})

    return patterns


# ---------------------------------------------------------------------------
# CNN Trading Agent
# ---------------------------------------------------------------------------


class CNNPatternAgent(DeepAgent):
    """CNN-based chart-pattern detection agent.

    Bootstraps itself with synthetic training data on first load, then
    runs inference on real price windows.  A rule-based heuristic check
    runs alongside to catch patterns the CNN might miss.

    Caches one trained model globally (not per-symbol) since patterns
    are scale-invariant.
    """

    SEQ_LEN = 120  # ~6 months of daily data
    N_SYNTHETIC = 5000
    TRAIN_EPOCHS = 30

    CHECKPOINT_PATH = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "checkpoints", "cnn_pattern.pt"
    )

    def __init__(self) -> None:
        super().__init__("cnn_pattern_agent")
        self._executor = ThreadPoolExecutor(max_workers=1)
        self._model: _ChartCNN | None = None
        self._model_lock = asyncio.Lock()
        self.trained_on = "none"

    # ------------------------------------------------------------------
    # DeepAgent hooks
    # ------------------------------------------------------------------

    async def _load_impl(self) -> bool:
        """Load a checkpoint, else train on REAL trend-labeled history.

        The synthetic generator is only used when no real data is
        available at all — that fallback is logged loudly. With torch
        absent the agent reports disabled instead of crashing.
        """
        if not TORCH_AVAILABLE:
            logger.warning("CNNPatternAgent disabled (torch not installed)")
            return False

        loop = asyncio.get_event_loop()

        # 1) reuse an existing checkpoint if present
        if os.path.exists(self.CHECKPOINT_PATH):
            try:
                self._model = await loop.run_in_executor(self._executor, self._load_checkpoint)
                if self._model is not None:
                    logger.info("CNNPatternAgent loaded from checkpoint (%s)", self.trained_on)
                    return True
            except Exception as exc:
                logger.warning("CNN checkpoint load failed, retraining: %s", exc)

        # 2) train on real, trend-labeled history (T2)
        try:
            real = await loop.run_in_executor(
                self._executor, _build_real_training_set, self.SEQ_LEN,
            )
        except Exception as exc:
            real = (None, None, {})
            logger.warning("Real training-set build failed: %s", exc)

        model, self.trained_on = await loop.run_in_executor(
            self._executor,
            _train_cnn,
            self.SEQ_LEN,
            len(PATTERN_LABELS),
            self.N_SYNTHETIC,
            self.TRAIN_EPOCHS,
            64,
            1e-3,
            real[0] is not None and (real[0], real[1]) or None,
            self.CHECKPOINT_PATH,
        )
        self._model = model
        if self.trained_on == "real":
            logger.info("CNNPatternAgent loaded (REAL trend-labeled training)")
        else:
            logger.warning("CNNPatternAgent loaded — SYNTHETIC fallback used (no real data available)")
        return True

    def _load_checkpoint(self) -> _ChartCNN | None:
        ckpt = torch.load(self.CHECKPOINT_PATH, map_location="cpu", weights_only=False)
        model = _ChartCNN(len(PATTERN_LABELS))
        model.load_state_dict(ckpt["model_state"])
        model.eval()
        self.trained_on = ckpt.get("trained_on", "unknown")
        return model

    async def _analyze_impl(self, symbol: str, context: dict[str, Any]) -> dict[str, Any]:
        if self._model is None:
            return {"error": "CNN model not loaded", "confidence": 0.0, "signal": "neutral"}

        # Fetch price data
        df = await asyncio.get_event_loop().run_in_executor(
            self._executor, _fetch_cnn_data, symbol,
        )
        if df is None or len(df) < self.SEQ_LEN:
            return {
                "error": f"Insufficient data for {symbol} (need {self.SEQ_LEN} bars)",
                "confidence": 0.0,
                "signal": "neutral",
                "report": f"Need at least {self.SEQ_LEN} days of data for {symbol}.",
            }

        # Build features
        features = _build_chart_features(df, self.SEQ_LEN)
        if features is None:
            return {
                "error": "Feature extraction failed",
                "confidence": 0.0,
                "signal": "neutral",
            }

        # CNN inference
        pattern, confidence = await asyncio.get_event_loop().run_in_executor(
            self._executor, _cnn_inference, self._model, features,
        )

        # Rule-based heuristic augmentation
        rule_patterns = await asyncio.get_event_loop().run_in_executor(
            self._executor, _rule_based_patterns, df,
        )

        # Signal mapping
        bullish_patterns = {"bull_flag", "ascending_triangle", "double_bottom", "inverse_head_and_shoulders"}
        bearish_patterns = {"bear_flag", "descending_triangle", "double_top", "head_and_shoulders"}

        if pattern in bullish_patterns and confidence > 0.5:
            signal = "bullish"
        elif pattern in bearish_patterns and confidence > 0.5:
            signal = "bearish"
        else:
            signal = "neutral"

        # Build report
        report_parts = [
            f"## CNN Chart Pattern Analysis — {symbol}",
            f"**Detected Pattern**: {pattern} (confidence {confidence:.1%})",
            f"**Signal**: {signal.upper()}",
            "",
        ]
        if rule_patterns:
            report_parts.append("**Rule-based Confirmation**:")
            for rp in rule_patterns:
                report_parts.append(f"  - {rp['name']} ({rp['confidence']:.0%})")
            report_parts.append("")

        report_parts.extend([
            f"**Window**: {self.SEQ_LEN} trading days",
            f"**Features**: OHLCV, log-volume, SMA-20 ratio",
            f"**Training Data**: {'real trend-labeled history' if self.trained_on == 'real' else f'{self.N_SYNTHETIC} synthetic samples (fallback)'}",
        ])

        return {
            "report": "\n".join(report_parts),
            "confidence": round(confidence, 4),
            "signal": signal,
            "pattern": pattern,
            "rule_patterns": rule_patterns,
        }

    async def close(self) -> None:
        self._model = None


# ---------------------------------------------------------------------------
# Standalone helpers
# ---------------------------------------------------------------------------


def _fetch_cnn_data(symbol: str, session=None) -> pd.DataFrame | None:
    try:
        if session is None:
            from research_data import _timed_session
            session = _timed_session()
        ticker = yf.Ticker(symbol, session=session)
        df = ticker.history(period="1y")
        if df.empty or len(df) < 60:
            return None
        return df
    except Exception as exc:
        logger.warning("yfinance fetch failed for %s: %s", symbol, exc)
        return None
