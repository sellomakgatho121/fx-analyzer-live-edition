#!/usr/bin/env bash
# Start the autonomous trader bot (signals -> entries -> management -> exits).
# Usage:
#   scripts/run_trader.sh [--dry-run] [--minutes N]
# Env (all optional):
#   FX_BOT_MIN_CONFIDENCE=0.45  FX_BOT_MAX_POSITIONS=3  FX_BOT_RISK_PCT=0.5
#   FX_BOT_RR=2.0               FX_BOT_TRAIL_ACTIVATE=0.5  FX_BOT_TRAIL_GAP=0.8
#   FX_BOT_MAX_HOLD_MIN=240     FX_BOT_DAILY_LOSS_PCT=2.0  FX_BOT_SYMBOLS="EURUSD,GBPUSD"
set -e
cd "$(dirname "$0")/.."
exec .venv/bin/python scripts/trader_bot.py "$@"
