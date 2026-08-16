import os
import logging
import time
import json
from dotenv import load_dotenv

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

load_dotenv()

OPENCODE_BASE_URL = "https://opencode.ai/zen/v1"
OPENCODE_MODEL = "deepseek-v4-flash-free"


class LLMAnalyzer:
    """Analyzes market data via OpenCode Zen (DeepSeek V4 Flash Free)."""

    def __init__(self):
        self.cache = {}
        self.provider = "opencode"
        self.model_name = OPENCODE_MODEL

        self.clients = {}
        self._init_clients()

        self.set_model("OpenCode Zen DeepSeek V4 Flash Free")

    def _init_clients(self):
        key = os.getenv("OPENCODE_API_KEY")
        if key and OpenAI:
            try:
                self.clients["opencode"] = OpenAI(api_key=key, base_url=OPENCODE_BASE_URL)
                logging.info("OpenCode Zen Client Initialized")
            except Exception as e:
                logging.error(f"OpenCode Zen Init Error: {e}")

    def get_available_models(self):
        if self.clients.get("opencode"):
            return ["OpenCode Zen DeepSeek V4 Flash Free"]
        return ["No Providers Configured"]

    def set_model(self, friendly_name: str):
        if not self.clients.get("opencode"):
            logging.warning("OpenCode Zen not configured (OPENCODE_API_KEY missing).")
            return False
        self.provider = "opencode"
        self.model_name = OPENCODE_MODEL
        logging.info(f"Switched to {friendly_name} ({self.provider}/{self.model_name})")
        return True

    def analyze_signal(self, symbol: str, action: str, technical_context: dict) -> dict:
        client = self.clients.get("opencode")
        if not client:
            return self._get_fallback_response(symbol, action, technical_context, reason="OpenCode Zen Config Missing")

        prompt = self._construct_prompt(symbol, action, technical_context)
        start_time = time.time()

        try:
            response = client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are a specialized Forex Analyst. Output strictly JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=4096,
            )
            raw_response = response.choices[0].message.content

            duration = time.time() - start_time
            logging.info(f"Analysis via {self.provider} took {duration:.2f}s")

            return self._parse_response(raw_response)

        except Exception as e:
            logging.error(f"Analysis Error ({self.provider}): {e}")
            return self._get_fallback_response(symbol, action, technical_context, reason=f"{self.provider} Error")

    def _construct_prompt(self, symbol, action, context):
        return f"""
        Analyze this Forex setup and output valid JSON only.

        Setup:
        - Pair: {symbol}
        - Action: {action}
        - Trend: {context.get('trend')}
        - RSI: {context.get('rsi')}
        - Price: {context.get('price')}

        Required JSON Structure:
        {{
            "logic": "One sentence reasoning.",
            "confidence": 0.85, (Float 0.0-1.0)
            "risk": "Short phrase risk factor."
        }}
        """

    def _parse_response(self, text):
        try:
            cleaned = text.replace('```json', '').replace('```', '').strip()
            try:
                data = json.loads(cleaned)
            except Exception:
                start = cleaned.find("{")
                if start != -1:
                    depth = 0
                    in_str = False
                    esc = False
                    for i in range(start, len(cleaned)):
                        ch = cleaned[i]
                        if esc:
                            esc = False
                            continue
                        if ch == "\\":
                            esc = True
                            continue
                        if ch == '"':
                            in_str = not in_str
                            continue
                        if in_str:
                            continue
                        if ch == "{":
                            depth += 1
                        elif ch == "}":
                            depth -= 1
                            if depth == 0:
                                data = json.loads(cleaned[start:i + 1])
                                break
                    else:
                        raise ValueError("no balanced JSON object")
                else:
                    raise ValueError("no JSON object")
            return {
                "reasoning": data.get("logic", "Analysis delivered."),
                "confidence_score": float(data.get("confidence", 0.5)),
                "risk_assessment": data.get("risk", "Unknown")
            }
        except Exception:
            return {
                "reasoning": "Raw Analysis: " + text[:100] + "...",
                "confidence_score": 0.6,
                "risk_assessment": "Parse Error"
            }

    def _get_fallback_response(self, symbol, action, context, reason="Fallback"):
        trend_desc = "bullish" if action == "BUY" else "bearish"
        return {
            "reasoning": f"Technical momentum is {trend_desc}. {reason}.",
            "confidence_score": 0.5,
            "risk_assessment": f"Medium ({reason})"
        }
