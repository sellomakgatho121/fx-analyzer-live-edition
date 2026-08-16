try:
    from engine.agents.base import BaseAgent
except ImportError:
    from .base import BaseAgent

class TechnicalAgent(BaseAgent):
    def __init__(self, model_name="opencode:deepseek-v4-flash-free"):
        super().__init__(name="TechnicalExpert", role="Chart Pattern Analyst", model_name=model_name)

    async def analyze(self, technical_data: dict) -> dict:
        """
        Analyzes technical indicators and price action.
        """
        prompt = f"""
        Act as a veteran Technical Analyst. Analyze the following market data:
        
        Symbol: {technical_data.get('symbol')}
        Price: {technical_data.get('price')}
        RSI: {technical_data.get('rsi')}
        MACD: {technical_data.get('macd')}
        Trend (EMA): {technical_data.get('trend')}
        BB Position: {technical_data.get('bb_status', 'N/A')}
        
        Task: Identify the primary trend and any chart patterns.
        
        Output JSON:
        {{
            "signal": "BUY" | "SELL" | "NEUTRAL",
            "confidence": 0.0 to 1.0,
            "reasoning": "Brief technical explanation (e.g. 'RSI Divergence confirmed with MACD crossover')"
        }}
        """
        
        response = await self._call_llm_async(prompt)
        if response:
            return self._clean_json(response)
        return {"signal": "NEUTRAL", "confidence": 0.0, "reasoning": "LLM Failed"}
