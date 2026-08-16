"""LLM advisor for trader_bot: OpenCode Zen (deepseek-v4-flash-free) with
reasoning_effort=max returns a structured entry verdict.

The advisor is a decision gate, not a replacement for the mechanical
guards. The bot calls it after confidence/allowlist/positions/equity checks
pass and before execution; a verdict of CONFIRM proceeds, SKIP aborts, and
ADJUST modifies SL/TP/volume within the bot's own risk bounds.

Fail-open policy: any network/parse error returns None so the bot never
blocks a trade on LLM availability.
"""
import json
import os
import re
import time
import urllib.request
from pathlib import Path

ZEN_URL = "https://opencode.ai/zen/v1/chat/completions"
MODEL = "deepseek-v4-flash-free"
REASONING_EFFORT = os.environ.get("FX_LLM_REASONING", "max")
TIMEOUT_S = float(os.environ.get("FX_LLM_TIMEOUT", "90"))
# Zen API sits behind Cloudflare; urllib's default UA gets 403/1010.
BROWSER_UA = ("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

REPO_ROOT = Path(__file__).resolve().parent.parent


def _api_key() -> str | None:
    key = os.environ.get("OPENCODE_API_KEY")
    if key:
        return key
    env_file = REPO_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("OPENCODE_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _extract_json(text: str) -> dict | None:
    try:
        return json.loads(text.strip().lstrip("`").rstrip("`"))
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def advise(symbol: str, action: str, context: dict) -> dict | None:
    """Ask the LLM for an entry verdict. Returns a dict with keys
    verdict (CONFIRM/SKIP/ADJUST), confidence, reasoning, and optional
    sl_scale/tp_scale/volume_scale adjustments; None on any failure."""
    key = _api_key()
    if not key:
        return None
    prompt = _build_prompt(symbol, action, context)
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": (
                "You are a disciplined forex/crypto risk manager. "
                "Analyze the setup and answer with STRICT JSON only, "
                "exactly this shape: "
                '{"verdict":"CONFIRM|SKIP|ADJUST","confidence":0.0,'
                '"reasoning":"one or two sentences",'
                '"sl_scale":1.0,"tp_scale":1.0,"volume_scale":1.0}')},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        # reasoning_effort=max burns tokens on thinking; 1024 leaves no
        # headroom for the JSON answer (finish_reason=length, content="").
        "max_tokens": 8192,
        "reasoning_effort": REASONING_EFFORT,
    }
    req = urllib.request.Request(
        ZEN_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json",
                 "User-Agent": BROWSER_UA},
    )
    started = time.monotonic()
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                raw = resp.read().decode()
            data = json.loads(raw)
            content = data["choices"][0]["message"]["content"]
            verdict = _extract_json(content)
            if not verdict:
                return None
            return {
                "verdict": str(verdict.get("verdict", "SKIP")).upper(),
                "confidence": float(verdict.get("confidence", 0.5)),
                "reasoning": str(verdict.get("reasoning", ""))[:300],
                "sl_scale": float(verdict.get("sl_scale", 1.0)),
                "tp_scale": float(verdict.get("tp_scale", 1.0)),
                "volume_scale": float(verdict.get("volume_scale", 1.0)),
                "latency_s": round(time.monotonic() - started, 1),
            }
        except Exception:
            continue
    return None


def _build_prompt(symbol: str, action: str, ctx: dict) -> str:
    candles = ctx.get("candles") or []
    rows = []
    for c in candles[-8:]:
        rows.append(
            f"  {c.get('ts', '?')} O={c.get('open')} H={c.get('high')} "
            f"L={c.get('low')} C={c.get('close')} V={c.get('volume')}"
        )
    candle_block = "\n".join(rows) if rows else "  (none)"
    return f"""Trading decision request — respond with strict JSON only.

Instrument: {symbol}
Engine signal: {action}
Signal confidence: {ctx.get('confidence')}
Current bid/ask: {ctx.get('bid')}/{ctx.get('ask')}
Proposed entry: {ctx.get('entry_price')}
Proposed SL: {ctx.get('sl')}  TP: {ctx.get('tp')}  (RR {ctx.get('rr')}:1)
ATR(14): {ctx.get('atr')}
Volume (lots): {ctx.get('volume')}

Recent candles (last 8):
{candle_block}

News headlines:
{chr(10).join('  - ' + h for h in (ctx.get('news') or [])) or '  (none)'}

Open positions: {ctx.get('open_positions')}
Session equity: {ctx.get('equity')}
Daily P/L: {ctx.get('day_pl')}

Rules:
- CONFIRM only if price action + context genuinely support the signal.
- SKIP if the move is overextended, news contradicts, or setup is weak.
- ADJUST to widen/tighten SL (sl_scale>1 widens, <1 tightens) or TP
  (tp_scale) and to cut size (volume_scale<1) on high risk.
- Keep scales within 0.5-2.0. Confidence 0.0-1.0 reflects your certainty."""
