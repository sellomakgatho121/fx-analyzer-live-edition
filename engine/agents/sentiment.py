try:
    from engine.agents.base import BaseAgent
except ImportError:
    from .base import BaseAgent

class SentimentAgent(BaseAgent):
    def __init__(self, model_name="opencode:deepseek-v4-flash-free"):
        super().__init__(name="SentimentExpert", role="Market Psychologist", model_name=model_name)

    async def analyze(self, news_snippets: list) -> dict:
        """
        Analyzes news headlines or user notes for sentiment.
        """
        content = "\n".join(news_snippets) if news_snippets else "No breaking news."
        
        prompt = f"""
        Act as a Sentiment Trader. Analyze the following news/notes:
        
        {content}
        
        Task: Gauge the market "Mood" (Risk-On vs Risk-Off).
        
        Output JSON:
        {{
            "sentiment": "RISK_ON" | "RISK_OFF" | "NEUTRAL",
            "confidence": 0.0 to 1.0,
            "reasoning": "Brief explanation of the mood"
        }}
        """
        
        response = await self._call_llm_async(prompt)
        if response:
            return self._clean_json(response)
        return {"sentiment": "NEUTRAL", "confidence": 0.0, "reasoning": "LLM Failed"}
