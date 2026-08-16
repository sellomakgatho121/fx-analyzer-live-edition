"""News and social-media scraper for sentiment analysis.

Provides async methods that fetch recent headlines and social mentions
for a given ticker symbol using free / open sources.
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class NewsItem:
    headline: str
    source: str
    url: str = ""
    date: str = ""
    text_snippet: str = ""


@dataclass
class SocialMention:
    text: str
    platform: str
    date: str = ""
    engagement_score: float = 0.0


# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------

class NewsSentimentScraper:
    """Fetch news headlines and social mentions for a symbol."""

    def __init__(self) -> None:
        self._session: aiohttp.ClientSession | None = None
        self._executor = ThreadPoolExecutor(max_workers=2)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def fetch_news(self, symbol: str, days: int = 7) -> list[dict[str, Any]]:
        """Return recent news items for *symbol*."""
        items: list[NewsItem] = []
        items.extend(await self._yahoo_finance_news(symbol))
        if not items:
            items.extend(await self._google_rss(symbol))
        # deduplicate by headline
        seen: set[str] = set()
        unique: list[dict[str, Any]] = []
        for it in items:
            key = it.headline.strip().lower()[:80]
            if key not in seen:
                seen.add(key)
                unique.append(asdict(it))
        return unique[:15]

    async def fetch_social_mentions(self, symbol: str, days: int = 3) -> list[dict[str, Any]]:
        """Return recent social-media mentions (mock / stub for now)."""
        return await self._fetch_stocktwits(symbol)

    # ------------------------------------------------------------------
    # Internal sources
    # ------------------------------------------------------------------

    async def _yahoo_finance_news(self, symbol: str) -> list[NewsItem]:
        """Fetch news from yfinance (sync library → thread pool)."""
        try:
            import yfinance as yf

            def _get() -> list[NewsItem]:
                ticker = yf.Ticker(symbol)
                raw = ticker.news or []
                out = []
                for r in raw[:10]:
                    title = (r.get("title") or "") if isinstance(r, dict) else ""
                    out.append(NewsItem(
                        headline=title,
                        source="Yahoo Finance",
                        url=r.get("link", "") if isinstance(r, dict) else "",
                        date=str(r.get("providerPublishTime", "") if isinstance(r, dict) else ""),
                        text_snippet=title,
                    ))
                return out

            return await asyncio.get_event_loop().run_in_executor(self._executor, _get)
        except Exception as exc:
            logger.warning("Yahoo news failed for %s: %s", symbol, exc)
            return []

    async def _google_rss(self, symbol: str) -> list[NewsItem]:
        """Fallback: Google News RSS via feedparser."""
        try:
            import feedparser

            url = f"https://news.google.com/rss/search?q={symbol}+stock&hl=en-US&gl=US&ceid=US:en"
            loop = asyncio.get_event_loop()

            def _parse() -> list[NewsItem]:
                feed = feedparser.parse(url)
                out = []
                for entry in feed.entries[:10]:
                    out.append(NewsItem(
                        headline=entry.get("title", ""),
                        source="Google News",
                        url=entry.get("link", ""),
                        date=str(entry.get("published", "")),
                        text_snippet=entry.get("summary", ""),
                    ))
                return out

            return await loop.run_in_executor(self._executor, _parse)
        except Exception as exc:
            logger.warning("Google RSS failed for %s: %s", symbol, exc)
            return []

    async def _fetch_stocktwits(self, symbol: str) -> list[dict[str, Any]]:
        """Fetch recent messages from StockTwits (free API, no key needed)."""
        try:
            if not self._session:
                self._session = aiohttp.ClientSession()
            url = f"https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json"
            async with self._session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                msgs = data.get("messages", [])[:15]
                results = []
                for m in msgs:
                    body = m.get("body", "")
                    results.append({
                        "text": body,
                        "platform": "StockTwits",
                        "date": m.get("created_at", ""),
                        "engagement_score": float(m.get("likes", {}).get("total", 0) or 0),
                    })
                return results
        except Exception as exc:
            logger.warning("StockTwits fetch failed for %s: %s", symbol, exc)
            return []

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None
