import sqlite3
import sqlite3
import logging
try:
    from engine.database import DB_FILE
except ImportError:
    from database import DB_FILE

class MemoryService:
    def __init__(self):
        self.db_path = DB_FILE

    def get_recent_performance(self, symbol: str, limit: int = 5):
        """
        Retrieves the outcomes of the last N trades for a given symbol.
        Returns a formatted string summarizing the "lessons learned".
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Query finished trades (status 'closed' or similar implies we know the P/L)
            cursor.execute('''
                SELECT action, entry_price, pl, status, timestamp 
                FROM trades 
                WHERE symbol = ? AND status = 'closed'
                ORDER BY timestamp DESC 
                LIMIT ?
            ''', (symbol, limit))
            
            rows = cursor.fetchall()
            conn.close()
            
            if not rows:
                return "No past trade history for this symbol."

            summary = []
            wins = 0
            for row in rows:
                outcome = "WON" if (row['pl'] or 0) > 0 else "LOST"
                if outcome == "WON": wins += 1
                summary.append(f"- {row['timestamp'][:10]}: {row['action']} resulted in {outcome} (${row['pl']})")
            
            win_rate = (wins / len(rows)) * 100
            
            return f"Past Performance ({len(rows)} trades, {win_rate:.0f}% WR):\n" + "\n".join(summary)

        except Exception as e:
            logging.error(f"Memory Retrieval Error: {e}")
            return "Could not retrieve memory."
