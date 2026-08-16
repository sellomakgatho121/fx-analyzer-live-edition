import os
import asyncio
import logging
import time
import json
from dotenv import load_dotenv

# OpenCode Zen via OpenAI-compatible SDK
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

load_dotenv()


# OpenCode Zen models (available if OPENCODE_API_KEY is set)
OPENCODE_MODELS = {
    "DeepSeek V4 Flash Free": "deepseek-v4-flash-free",
}

PROVIDER_PREFIX_OPENCODE = "opencode"


class BaseAgent:
    """
    Base class for all Expert Agents.
    All LLM traffic routes through OpenCode Zen (OpenAI-compatible API).
    Model strings use format: 'opencode:model'. Bare names default to OpenCode.
    """

    def __init__(self, name: str, role: str, model_name: str = "opencode:deepseek-v4-flash-free"):
        self.name = name
        self.role = role
        self.rate_limited_until = 0
        self.consecutive_errors = 0
        self.base_backoff = 5
        self.max_backoff = 120

        # Parse provider + model
        self.provider = PROVIDER_PREFIX_OPENCODE
        self.model_name = model_name
        self._parse_model_string(model_name)

        # API keys
        self.opencode_key = os.getenv("OPENCODE_API_KEY")

        # --- Initialize OpenCode Zen client (deepseek-v4-flash-free) ---
        self.opencode_client = None
        if self.opencode_key and OpenAI:
            try:
                self.opencode_client = OpenAI(
                    api_key=self.opencode_key,
                    base_url="https://opencode.ai/zen/v1"
                )
                logging.info(f"Agent {self.name}: OpenCode Zen client ready")
            except Exception as e:
                logging.error(f"Agent {self.name} OpenCode Zen init failed: {e}")
        elif self.opencode_key and not OpenAI:
            logging.warning(f"Agent {self.name}: OPENCODE_API_KEY set but openai package not installed")

        logging.info(f"Agent {self.name} initialized — provider={self.provider}, model={self.model_name}")

    def _parse_model_string(self, model_string: str):
        """Parse 'opencode:model' (bare names default to OpenCode Zen)."""
        if ":" in model_string:
            prefix, actual = model_string.split(":", 1)
            if prefix == PROVIDER_PREFIX_OPENCODE:
                self.provider = PROVIDER_PREFIX_OPENCODE
                self.model_name = actual
            else:
                # Unknown prefix — force OpenCode Zen
                self.provider = PROVIDER_PREFIX_OPENCODE
                self.model_name = actual
        else:
            # No prefix — default to OpenCode Zen
            self.provider = PROVIDER_PREFIX_OPENCODE
            self.model_name = model_string

    def _make_model_string(self) -> str:
        """Reconstruct the full model string with provider prefix."""
        return f"{PROVIDER_PREFIX_OPENCODE}:{self.model_name}"

    @staticmethod
    def get_all_available_models():
        """
        Returns a dict of {display_name: model_string_with_prefix} for all
        models that the user could configure (independent of API keys).
        Used by the frontend to know what exists.
        """
        models = {}
        # OpenCode Zen models
        for display, model_id in OPENCODE_MODELS.items():
            models[f"OpenCode: {display}"] = f"{PROVIDER_PREFIX_OPENCODE}:{model_id}"
        return models

    @staticmethod
    def get_configured_models():
        """
        Returns models whose API keys are actually set in the environment.
        Used by bridge.py to report available models.
        """
        models = {}
        opencode_key = os.getenv("OPENCODE_API_KEY")

        if opencode_key:
            for display, model_id in OPENCODE_MODELS.items():
                models[f"OpenCode: {display}"] = f"{PROVIDER_PREFIX_OPENCODE}:{model_id}"

        if not models:
            models["No Providers Configured"] = "opencode:deepseek-v4-flash-free"

        return models

    def update_model(self, model_string: str):
        """
        Updates the LLM model used by this agent.
        Accepts 'opencode:model' or bare 'model-name' (defaults to OpenCode Zen).
        """
        old_provider = self.provider
        old_model = self.model_name

        self._parse_model_string(model_string)

        # Same provider + model — no-op
        if old_provider == self.provider and old_model == self.model_name:
            return True

        try:
            if self.provider == PROVIDER_PREFIX_OPENCODE:
                if not self.opencode_key or not self.opencode_client:
                    logging.warning(f"Cannot switch {self.name} to OpenCode Zen: OPENCODE_API_KEY missing")
                    self.provider, self.model_name = old_provider, old_model
                    return False

            logging.info(f"Agent {self.name} switched to {self._make_model_string()}")
            return True

        except Exception as e:
            logging.error(f"Agent {self.name} failed to switch model: {e}")
            self.provider, self.model_name = old_provider, old_model
            return False

    async def _call_llm_async(self, prompt: str, system_prompt: str = None) -> str:
        """Route to the OpenCode Zen implementation."""
        return await self._call_opencode(prompt, system_prompt=system_prompt)

    async def _call_opencode(self, prompt: str, system_prompt: str = None) -> str:
        """Call OpenCode Zen (DeepSeek V4 Flash Free) via the OpenAI-compatible API."""
        if not self.opencode_client:
            return None

        if time.time() < self.rate_limited_until:
            logging.warning(f"Agent {self.name} is rate limited (OpenCode Zen).")
            return None

        try:
            messages = [
                {"role": "system", "content": system_prompt or f"You are a {self.role}. Output strictly JSON."},
                {"role": "user", "content": prompt}
            ]

            response = await asyncio.to_thread(
                self.opencode_client.chat.completions.create,
                model=self.model_name,
                messages=messages,
                temperature=0.1,
                max_tokens=4096,
            )

            if self.consecutive_errors > 0:
                self.consecutive_errors = 0

            return response.choices[0].message.content

        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "Rate limit" in error_msg:
                self.consecutive_errors += 1
                backoff = min(
                    self.base_backoff * (2 ** (self.consecutive_errors - 1)),
                    self.max_backoff,
                )
                self.rate_limited_until = time.time() + backoff
                logging.error(f"Agent {self.name} hit OpenCode Zen rate limit. Backoff {backoff}s.")
            else:
                logging.error(f"Agent {self.name} OpenCode Zen error: {e}")
            return None

    def _clean_json(self, text: str) -> dict:
        """Robustly parse a JSON object from an LLM response.

        DeepSeek-style models frequently wrap the object in markdown fences
        or append a trailing sentence after the closing brace. Strategy:
        1. strip ```json / ``` fences;
        2. direct parse;
        3. brace-match the first '{' to its matching '}' and parse that
           substring (handles trailing prose);
        4. last-resort greedy regex for {...}.
        """
        if not text:
            return None

        def _parse(s: str):
            s = s.strip()
            if s.startswith("```"):
                s = s.split("```", 2)[-1].strip()
            return json.loads(s)

        try:
            return _parse(text)
        except Exception:
            pass

        try:
            start = text.find("{")
            if start != -1:
                depth = 0
                in_str = False
                esc = False
                for i in range(start, len(text)):
                    ch = text[i]
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
                            candidate = text[start:i + 1]
                            return json.loads(candidate)
        except Exception:
            pass

        try:
            import re
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if m:
                return json.loads(m.group(0))
        except Exception:
            pass

        logging.warning(
            f"Agent {self.name} failed to parse JSON: {text[:120]}..."
        )
        return None
