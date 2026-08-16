import datetime

class CalendarService:
    """
    Economic calendar.

    The cTrader Open API does not expose an economic calendar, and no
    third-party calendar feed is wired in.  High-impact events are
    therefore reported as an empty list rather than fabricating entries.
    """
    def __init__(self):
        pass

    def get_todays_events(self):
        """
        Returns high-impact economic events for today.

        Shape kept stable for consumers: {"date": ..., "events": [...]}.
        Events are always empty until a real calendar source is integrated.
        """
        today = datetime.date.today().isoformat()
        return {
            "date": today,
            "events": []
        }
