"""Phase 4 (T4) — vibe research computed natively in-engine.

Replaces the `vibe-trading` CLI subprocess dependency with real Python
computations on real market data (via DataFeed + the TTL disk cache):

- backtest: 20/50 SMA crossover on BTC-USD 1-minute bars → return, max
  drawdown, Sharpe, win rate, trades, buy-and-hold benchmark.
- alpha_bench: factor zoo (momentum / volatility / RSI / volume-surge)
  scored by information coefficient (IC) + ICIR against forward returns
  across the tradable universe.

Every row written to `vibe_research` carries `source="engine"`. There is
no fabricated/SIMULATED output anywhere in this module: if the upstream
data cannot be fetched (real_only), the run stores an explicit failure —
never invented numbers.
"""

import asyncio
import json
import logging
import os
from datetime import datetime

import numpy as np
import pandas as pd

from research_data import fetch_yfinance_data

# Asset universe for the alpha bench (crypto, FX, indices).
BENCH_UNIVERSE = ["BTCUSD", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "US500", "US30"]
# Volume-surge factor only makes sense for instruments with real volume.
VOLUME_FACTOR_SYMBOLS = {"BTCUSD", "ETHUSD", "US500", "US30"}

BACKTEST_PROMPT = (
    "Backtest a BTC-USD 20/50 moving-average crossover strategy on real "
    "1-minute bars, then summarize return, drawdown and Sharpe."
)
BACKTEST_COMMAND = "engine: backtest 20/50 SMA crossover (native, real data)"

ALPHA_PROMPT = (
    "Score a small factor zoo (momentum/volatility/RSI/volume-surge) by "
    "information coefficient against forward returns on the live universe."
)
ALPHA_COMMAND = "engine: alpha bench (native factor zoo, real data)"


class VibeResearchService:
    """Runs the research tasks in-process; stores + publishes results."""

    def __init__(self, pub_socket=None):
        self.pub_socket = pub_socket
        self.data_dir = "data/research"
        os.makedirs(self.data_dir, exist_ok=True)

    # ── backtest ───────────────────────────────────────────────────────
    @staticmethod
    def _compute_ma_crossover_metrics(df: pd.DataFrame, fast: int, slow: int):
        """Run a long-only SMA crossover; returns (trades, metrics)."""
        close = df["close"].astype(float).to_numpy()
        fast_ma = pd.Series(close).rolling(fast).mean().to_numpy()
        slow_ma = pd.Series(close).rolling(slow).mean().to_numpy()

        # position[bar] = 1 long / 0 flat; enter when fast crosses above slow
        position = np.zeros(len(close))
        prev_fast, prev_slow = fast_ma[slow - 1], slow_ma[slow - 1]
        for i in range(slow, len(close)):
            position[i] = 1 if fast_ma[i] > slow_ma[i] else 0

        # trade legs: entry/exit on position changes
        trades = []
        entry_idx = None
        for i in range(slow, len(close)):
            if position[i] == 1 and entry_idx is None:
                entry_idx = i
            elif position[i] == 0 and entry_idx is not None:
                trades.append((entry_idx, i))
                entry_idx = None
        if entry_idx is not None:
            trades.append((entry_idx, len(close) - 1))

        returns = np.diff(close) / close[:-1]  # per-bar returns
        strat_returns = returns * position[:-1]  # position held during bar interval
        equity = np.cumprod(1 + strat_returns)
        peak = np.maximum.accumulate(equity)
        drawdown = equity / peak - 1
        max_dd = float(drawdown.min())

        # per-bar Sharpe, annualized for 1-minute bars (525,600 bars/yr)
        bar_sharpe = float(strat_returns.mean() / strat_returns.std()) if strat_returns.std() > 0 else 0.0
        sharpe = bar_sharpe * np.sqrt(525600)

        trade_returns, wins = [], 0
        for (i0, i1) in trades:
            ret = close[i1] / close[i0] - 1
            trade_returns.append(ret)
            if ret > 0:
                wins += 1
        win_rate = wins / len(trades) if trades else 0.0

        metrics = {
            "trades": len(trades),
            "win_rate": win_rate,
            "max_drawdown": max_dd,
            "sharpe": sharpe,
            "strategy_return": float(equity[-1] - 1),
            "benchmark_return": float(close[-1] / close[0] - 1),
            "bars": len(close),
            "start": str(df["time"].iloc[0]),
            "end": str(df["time"].iloc[-1]),
        }
        return trades, metrics

    def _run_backtest(self):
        df = fetch_yfinance_data("BTCUSD", limit=500, real_only=True)
        if df is None or df.empty or len(df) < 60:
            raise RuntimeError(
                "backtest: no real BTC-USD bars available (upstream fetch failed) — "
                "refusing to compute on fabricated data"
            )
        trades, m = self._compute_ma_crossover_metrics(df, fast=20, slow=50)

        lines = [
            "# Vibe-Trading Strategy Backtest Report",
            f"**Source**: engine (native computation, real yfinance 1m bars)",
            f"**Prompt**: {BACKTEST_PROMPT}",
            f"**Asset**: BTC/USD · {m['bars']} bars, {m['start']} → {m['end']}",
            "",
            "## Performance Summary",
            f"- **Strategy Return**: {m['strategy_return'] * 100:+.2f}%",
            f"- **Benchmark Return (Buy & Hold)**: {m['benchmark_return'] * 100:+.2f}%",
            f"- **Max Drawdown**: {m['max_drawdown'] * 100:.2f}%",
            f"- **Sharpe Ratio (annualized, 1m bars)**: {m['sharpe']:.2f}",
            f"- **Win Rate**: {m['win_rate'] * 100:.1f}%",
            f"- **Total Trades**: {m['trades']}",
            "",
            "## Trades",
        ]
        for i, (i0, i1) in enumerate(trades[:20], 1):
            ret = df["close"].iloc[i1] / df["close"].iloc[i0] - 1
            lines.append(
                f"{i}. entry {df['time'].iloc[i0]} @ {df['close'].iloc[i0]:.2f} → "
                f"exit {df['time'].iloc[i1]} @ {df['close'].iloc[i1]:.2f} ({ret * 100:+.2f}%)"
            )
        if len(trades) > 20:
            lines.append(f"... and {len(trades) - 20} more")
        return "\n".join(lines) + "\n"

    # ── alpha bench ────────────────────────────────────────────────────
    @staticmethod
    def _factors(series: pd.Series, volume: pd.Series | None):
        close = series.astype(float)
        ret = close.pct_change()
        out = {
            "momentum_5": close / close.shift(5) - 1,
            "momentum_10": close / close.shift(10) - 1,
            "momentum_20": close / close.shift(20) - 1,
            "volatility_10": ret.rolling(10).std(),
            "volatility_20": ret.rolling(20).std(),
        }
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        out["rsi_14"] = 100 - 100 / (1 + rs)
        if volume is not None and volume.notna().any():
            vol = volume.astype(float)
            out["volume_surge"] = vol / vol.rolling(20).mean()
        return pd.DataFrame(out)

    @staticmethod
    def _ic_series(factor, fwd_ret):
        """Spearman-style IC (rank correlation) aligned on common bars."""
        aligned = pd.concat([factor, fwd_ret], axis=1).dropna()
        if len(aligned) < 30:
            return None
        return aligned.iloc[:, 0].rank().corr(aligned.iloc[:, 1].rank())

    def _run_alpha_bench(self):
        assets = {}  # symbol -> close series (real data only)
        for sym in BENCH_UNIVERSE:
            df = fetch_yfinance_data(sym, limit=500, real_only=True)
            if df is not None and len(df) > 60:
                assets[sym] = df
        if not assets:
            raise RuntimeError(
                "alpha_bench: no real data for any universe symbol (upstream "
                "fetch failed) — refusing to compute on fabricated data"
            )

        factor_ics = {name: [] for name in (
            "momentum_5", "momentum_10", "momentum_20",
            "volatility_10", "volatility_20", "rsi_14", "volume_surge",
        )}
        fwd = 20  # forward return horizon (bars)
        for sym, df in assets.items():
            factors = self._factors(
                df["close"],
                df["tick_volume"] if sym in VOLUME_FACTOR_SYMBOLS else None,
            )
            fwd_ret = df["close"].astype(float).pct_change(fwd).shift(-fwd)
            for name in factors.columns:
                ic = self._ic_series(factors[name], fwd_ret)
                if ic is not None:
                    factor_ics[name].append(float(ic))

        rows = []
        for name, ics in factor_ics.items():
            if not ics:
                continue
            mean_ic = float(np.mean(ics))
            std_ic = float(np.std(ics)) or 1e-12
            rows.append({
                "factor": name,
                "mean_ic": mean_ic,
                "icir": mean_ic / std_ic,
                "assets": len(ics),
            })
        rows.sort(key=lambda r: abs(r["mean_ic"]), reverse=True)

        lines = [
            "# Vibe-Trading Alpha Benchmarking Report",
            f"**Source**: engine (native computation, real yfinance 1m bars)",
            f"**Universe**: {', '.join(sorted(assets))}",
            f"**Horizon**: {fwd}-bar forward returns · IC = rank correlation (Spearman)",
            "",
            "## Factor Leaderboard (by |mean IC|)",
        ]
        for i, r in enumerate(rows[:10], 1):
            lines.append(
                f"{i}. **{r['factor']}**: mean IC = {r['mean_ic']:+.4f}, "
                f"ICIR = {r['icir']:.2f} (across {r['assets']} assets)"
            )
        lines.append("")
        lines.append("## Per-Asset Coverage")
        lines.append("| Symbol | Bars |")
        lines.append("|---|---|")
        for sym, df in assets.items():
            lines.append(f"| {sym} | {len(df)} |")
        return "\n".join(lines) + "\n"

    # ── runner ─────────────────────────────────────────────────────────
    async def run_research_tasks(self):
        logging.info("Vibe Research background runner started (in-engine).")

        for run_type, fn in (("backtest", self._run_backtest),
                             ("alpha_bench", self._run_alpha_bench)):
            prompt = BACKTEST_PROMPT if run_type == "backtest" else ALPHA_PROMPT
            command = BACKTEST_COMMAND if run_type == "backtest" else ALPHA_COMMAND
            file_name = "vibe_backtest_btc.txt" if run_type == "backtest" else "vibe_alpha_zoo.txt"
            status, output = "completed", ""
            try:
                output = fn()
            except Exception as e:
                status = "failed"
                output = f"# {run_type} run failed\n\n**Error**: {e}\n"
                logging.error("Vibe research %s failed: %s", run_type, e)
            else:
                logging.info("Vibe research %s completed (source=engine)", run_type)

            # Write report file for the RAG loader
            try:
                with open(os.path.join(self.data_dir, file_name), "w", encoding="utf-8") as f:
                    f.write(output)
            except Exception as e:
                logging.error("Failed to write %s: %s", file_name, e)

            try:
                import database
            except ImportError:
                from engine import database

            database.store_vibe_research(
                run_type=run_type,
                prompt=prompt,
                command=command,
                output=output,
                status=status,
                source="engine",
            )

            if self.pub_socket:
                try:
                    payload = {
                        "run_type": run_type,
                        "prompt": prompt,
                        "status": status,
                        "timestamp": datetime.now().isoformat(),
                        "output": output,
                        "source": "engine",
                    }
                    await self.pub_socket.send_string(f"vibe-research {json.dumps(payload)}")
                except Exception as e:
                    logging.error("Failed to publish vibe-research %s zmq message: %s", run_type, e)

        logging.info("Vibe Research background runner completed.")
