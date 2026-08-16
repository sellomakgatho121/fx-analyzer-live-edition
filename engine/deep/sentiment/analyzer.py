"""NLP sentiment analysis agent.

Scores news headlines and social mentions using HuggingFace transformers,
falling back to TextBlob / VADER when torch is unavailable.

References from awesome-deep-trading:
  - Financial Sentiment Analysis (Feuerriegel & Fehrer)
  - Big Data: Deep Learning for financial sentiment analysis (Sohangir et al.)
  - Stock Prediction Using Twitter (Hasan)
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any

from engine.deep.base import DeepAgent
from engine.deep.sentiment.scraper import NewsSentimentScraper

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# SentimentAnalyzer
# ---------------------------------------------------------------------------

class SentimentAnalyzer(DeepAgent):
    """NLP sentiment agent that scores news + social data for a symbol.

    Uses HuggingFace transformers pipeline("sentiment-analysis") as primary
    scorer, falling back to TextBlob or VADER if transformers are not
    installed.
    """

    def __init__(self) -> None:
        super().__init__("sentiment_analyzer")
        self._scraper = NewsSentimentScraper()
        self._executor = ThreadPoolExecutor(max_workers=1)
        self._pipeline = None          # HF pipeline (optional)
        self._fallback = None          # "textblob" | "vader" | None

    # ------------------------------------------------------------------
    # DeepAgent hooks
    # ------------------------------------------------------------------

    async def _load_impl(self) -> bool:
        # Try loading HF pipeline in thread; if it fails, set fallback.
        def _try_hf() -> str | None:
            try:
                from transformers import pipeline  # type: ignore[import-untyped]
                return pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")
            except Exception:
                return None

        pipe = await asyncio.get_event_loop().run_in_executor(self._executor, _try_hf)
        if pipe is not None:
            self._pipeline = pipe
            logger.info("SentimentAnalyzer using HuggingFace pipeline")
            return True

        # Fallback detection
        def _check_fallback() -> str | None:
            try:
                import textblob  # noqa: F401
                return "textblob"
            except ImportError:
                pass
            try:
                from nltk.sentiment.vader import SentimentIntensityAnalyzer  # noqa: F401
                return "vader"
            except ImportError:
                pass
            return None

        fb = await asyncio.get_event_loop().run_in_executor(self._executor, _check_fallback)
        if fb:
            self._fallback = fb
            logger.info("SentimentAnalyzer using fallback: %s", fb)
            return True

        logger.warning("No sentiment model available — install transformers or textblob")
        return False

    async def _analyze_impl(self, symbol: str, context: dict[str, Any]) -> dict[str, Any]:
        # Fetch data
        news_items = await self._scraper.fetch_news(symbol)
        social_items = await self._scraper.fetch_social_mentions(symbol)

        all_texts = [it["headline"] for it in news_items if it.get("headline")]
        all_texts += [m["text"] for m in social_items if m.get("text")]

        if not all_texts:
            return {
                "report": f"No news or social data found for {symbol}.",
                "confidence": 0.0,
                "signal": "neutral",
                "sentiment_score": 0.0,
                "headline_count": 0,
                "positive_ratio": 0.5,
                "top_headlines": [],
            }

        # Score
        scores = await self._score_all(all_texts)
        positive = sum(1 for s in scores if s > 0.05)
        negative = sum(1 for s in scores if s < -0.05)
        avg_score = sum(scores) / len(scores)

        signal = "bullish" if avg_score > 0.15 else ("bearish" if avg_score < -0.15 else "neutral")
        confidence = min(abs(avg_score) * 2, 1.0)
        positive_ratio = positive / len(scores) if scores else 0.5

        top_headlines = [
            {"headline": all_texts[i], "score": round(scores[i], 3)}
            for i in sorted(range(len(scores)), key=lambda i: abs(scores[i]), reverse=True)[:5]
        ]

        report = (
            f"## Sentiment Analysis — {symbol}\n\n"
            f"**Overall Sentiment**: {signal.upper()} (score {avg_score:+.3f})\n"
            f"**Confidence**: {confidence:.1%}\n"
            f"**Sources**: {len(news_items)} news + {len(social_items)} social mentions\n\n"
            f"**Breakdown**:\n"
            f"  - Positive: {positive} ({positive_ratio:.0%})\n"
            f"  - Negative: {negative} ({negative:.0%})\n"
            f"  - Neutral: {len(scores) - positive - negative}\n\n"
            f"**Top Headlines**:\n"
        )
        for h in top_headlines:
            label = "🟢" if h["score"] > 0.05 else ("🔴" if h["score"] < -0.05 else "⚪")
            report += f"  {label} {h['headline'][:100]} ({h['score']:+.2f})\n"

        return {
            "report": report,
            "confidence": round(confidence, 4),
            "signal": signal,
            "sentiment_score": round(avg_score, 4),
            "headline_count": len(all_texts),
            "positive_ratio": round(positive_ratio, 4),
            "top_headlines": top_headlines,
        }

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    async def _score_all(self, texts: list[str]) -> list[float]:
        """Return a list of sentiment scores in [-1, 1]."""
        if self._pipeline is not None:
            return await asyncio.get_event_loop().run_in_executor(
                self._executor, self._score_hf, texts
            )
        if self._fallback == "textblob":
            return await asyncio.get_event_loop().run_in_executor(
                self._executor, self._score_textblob, texts
            )
        if self._fallback == "vader":
            return await asyncio.get_event_loop().run_in_executor(
                self._executor, self._score_vader, texts
            )
        return [0.0] * len(texts)

    @staticmethod
    def _score_hf(texts: list[str]) -> list[float]:
        scores = []
        for text in texts:
            try:
                result = __import__("transformers").pipeline  # noqa
            except ImportError:
                continue
            # Use the loaded pipeline
            import transformers  # type: ignore[import-untyped]
            # Actually we already have the pipeline in self, but this runs in executor
            # so we need to pass it.  Instead, use the class-level pipeline approach.
            # This will be handled by the instance method.
            pass
        # Simple approach: use the stored pipeline reference
        from transformers import pipeline  # type: ignore[import-untyped]
        pipe = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")
        results = pipe(texts, truncation=True)
        out = []
        for r in results:
            label = r.get("label", "NEUTRAL").upper()
            score = r.get("score", 0.5)
            if "POSITIVE" in label:
                out.append(score)
            elif "NEGATIVE" in label:
                out.append(-score)
            else:
                out.append(0.0)
        return out

    @staticmethod
    def _score_textblob(texts: list[str]) -> list[float]:
        from textblob import TextBlob
        return [TextBlob(t).sentiment.polarity for t in texts]

    @staticmethod
    def _score_vader(texts: list[str]) -> list[float]:
        from nltk.sentiment.vader import SentimentIntensityAnalyzer
        sia = SentimentIntensityAnalyzer()
        return [sia.polarity_scores(t)["compound"] for t in texts]

    async def close(self) -> None:
        await self._scraper.close()
