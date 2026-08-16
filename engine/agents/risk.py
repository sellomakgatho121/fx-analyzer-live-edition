try:
    from engine.agents.base import BaseAgent
except ImportError:
    from .base import BaseAgent

class RiskAgent(BaseAgent):
    def __init__(self, model_name="opencode:deepseek-v4-flash-free"):
        super().__init__(name="RiskManager", role="Risk Controls", model_name=model_name)

    async def analyze(self, market_state: dict) -> dict:
        """
        Analyzes volatility and market state to suggest exposure.
        """
        volatility = market_state.get('atr', 0)
        
        prompt = f"""
        Act as a Risk Manager.
        Volatility (ATR): {volatility}
        Price Action: {market_state.get('price_action_desc', 'Normal')}
        
        Task: Recommend risk settings.
        
        Output JSON:
        {{
            "regime": "LOW_VOL" | "HIGH_VOL" | "EXTREME",
            "max_leverage": "Integer (e.g., 10, 50, 100)",
            "stop_loss_advice": "Tight | Wide | No Trade"
        }}
        """
        
        response = await self._call_llm_async(prompt)
        if response:
            return self._clean_json(response)
        return {"regime": "NORMAL", "max_leverage": 30, "stop_loss_advice": "Standard"}
