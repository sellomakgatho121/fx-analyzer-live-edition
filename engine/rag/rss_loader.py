import feedparser
import logging
from datetime import datetime, timedelta

# Key Financial RSS Feeds
FEEDS = [
    "http://feeds.marketwatch.com/marketwatch/topstories/",
    "https://cnbc.com/id/10000664/device/rss/rss.html", # Finance
    "https://content.dailyfx.com/feeds/all"
]

class RSSLoader:
    def __init__(self):
        self.feeds = FEEDS

    def fetch_news(self, limit_per_feed=3):
        """
        Fetches and parses RSS feeds. returns a list of news items strings.
        """
        news_items = []
        logging.info("Fetching RSS News...")
        
        for url in self.feeds:
            try:
                feed = feedparser.parse(url)
                count = 0
                for entry in feed.entries:
                    if count >= limit_per_feed: break
                    
                    # Filter for very recent news (last 24h)
                    # Note: parsing dates is tricky across feeds, skipping strict check for now
                    # assuming top of feed is recent.
                    
                    title = entry.title
                    summary = getattr(entry, 'summary', '')
                    item_text = f"Title: {title} | Summary: {summary[:200]}..."
                    news_items.append(item_text)
                    count += 1
            except Exception as e:
                logging.error(f"Failed to fetch {url}: {e}")
                
        return news_items

    def get_context_string(self):
        """
        Returns a formatted string for the LLM.
        """
        items = self.fetch_news()
        if not items:
            return "No recent news retrieved via RSS."
        
        return "LATEST MARKET NEWS (RSS):\n" + "\n".join([f"- {item}" for item in items])
