try:
    from engine.agents.base import BaseAgent
except ImportError:
    from .base import BaseAgent

class FundamentalAgent(BaseAgent):
    def __init__(self, model_name="opencode:deepseek-v4-flash-free"):
        super().__init__(name="FundamentalExpert", role="Macro Economist", model_name=model_name)

    async def analyze(self, macro_context: str) -> dict:
        """
        Analyzes macro-economic text to determine market bias.
        """
        if not macro_context or len(macro_context) < 10:
             return {"signal": "NEUTRAL", "confidence": 0.5, "reasoning": "No macro data avail"}

        prompt = f"""
        Act as a Global Macro Strategist. Review the following research summaries:
        
        {macro_context[:5000]}
        
        Task: Determine the fundamental bias for the USD and major markets.
        
        Output JSON:
        {{
            "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
            "confidence": 0.0 to 1.0,
            "reasoning": "Key referencing the input text (e.g. 'Fed minutes indicate rate hike pause')"
        }}
        """
        
        response = await self._call_llm_async(prompt)
        if response:
            return self._clean_json(response)
        return {"bias": "NEUTRAL", "confidence": 0.0, "reasoning": "LLM Failed"}
