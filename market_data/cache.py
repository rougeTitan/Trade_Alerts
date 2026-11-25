"""SQLite cache for historical bars + fetch coverage metadata.

Dev-grade persistence: the production app stores user data in DynamoDB, but
historical OHLCV is a shared, read-mostly dataset, so a local relational cache
is a better fit and keeps upstream (Yahoo) calls off the request hot path.

Bars are keyed by (provider, symbol, interval, adjustment_method, date) so a
future adjustment-method or provider swap never collides with existing rows.
"""

import sqlite3
import threading
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Coverage:
    provider: str
    symbol: str
    interval: str
    adjustment_method: str
    first_date: Optional[str]
    last_date: Optional[str]
    currency: Optional[str]
    exchange_timezone: Optional[str]
    fetched_at: Optional[str]  # UTC ISO8601
    requested_start: Optional[str] = None  # earliest date requested upstream


_SCHEMA = """
CREATE TABLE IF NOT EXISTS bars (
    provider          TEXT NOT NULL,
    symbol            TEXT NOT NULL,
    interval          TEXT NOT NULL,
    adjustment_method TEXT NOT NULL,
    date              TEXT NOT NULL,
    open              REAL,
    high              REAL,
    low               REAL,
    close             REAL,
    volume            REAL,
    PRIMARY KEY (provider, symbol, interval, adjustment_method, date)
);

CREATE TABLE IF NOT EXISTS coverage (
    provider          TEXT NOT NULL,
    symbol            TEXT NOT NULL,
    interval          TEXT NOT NULL,
    adjustment_method TEXT NOT NULL,
    first_date        TEXT,
    last_date         TEXT,
    currency          TEXT,
    exchange_timezone TEXT,
    fetched_at        TEXT,
    requested_start   TEXT,
    PRIMARY KEY (provider, symbol, interval, adjustment_method)
);
"""


class BarCache:
    def __init__(self, db_path: str = "market_data.db"):
        self.db_path = db_path
        # Allow use across Flask worker threads; guard writes with a lock.
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._conn:
            self._conn.executescript(_SCHEMA)

    def close(self):
        self._conn.close()

    # -- bars ---------------------------------------------------------------
    def upsert_bars(self, provider, symbol, interval, adjustment_method, bars):
        """`bars` is an iterable of dicts with date/open/high/low/close/volume."""
        rows = [
            (
                provider, symbol, interval, adjustment_method, b["date"],
                b.get("open"), b.get("high"), b.get("low"), b.get("close"),
                b.get("volume"),
            )
            for b in bars
        ]
        if not rows:
            return 0
        with self._lock, self._conn:
            self._conn.executemany(
                """
                INSERT INTO bars (provider, symbol, interval, adjustment_method,
                                  date, open, high, low, close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider, symbol, interval, adjustment_method, date)
                DO UPDATE SET open=excluded.open, high=excluded.high,
                              low=excluded.low, close=excluded.close,
                              volume=excluded.volume
                """,
                rows,
            )
        return len(rows)

    def get_bars(self, provider, symbol, interval, adjustment_method,
                 start_date: Optional[str] = None) -> List[dict]:
        q = (
            "SELECT date, open, high, low, close, volume FROM bars "
            "WHERE provider=? AND symbol=? AND interval=? AND adjustment_method=?"
        )
        params = [provider, symbol, interval, adjustment_method]
        if start_date:
            q += " AND date >= ?"
            params.append(start_date)
        q += " ORDER BY date ASC"
        # Guard reads too: a single sqlite3 connection shared across worker
        # threads must not run concurrent cursors (batch suggestions fan out).
        with self._lock:
            cur = self._conn.execute(q, params)
            return [dict(r) for r in cur.fetchall()]

    # -- coverage -----------------------------------------------------------
    def get_coverage(self, provider, symbol, interval, adjustment_method) -> Optional[Coverage]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT * FROM coverage WHERE provider=? AND symbol=? AND interval=? "
                "AND adjustment_method=?",
                (provider, symbol, interval, adjustment_method),
            )
            r = cur.fetchone()
        if not r:
            return None
        return Coverage(
            provider=r["provider"], symbol=r["symbol"], interval=r["interval"],
            adjustment_method=r["adjustment_method"], first_date=r["first_date"],
            last_date=r["last_date"], currency=r["currency"],
            exchange_timezone=r["exchange_timezone"], fetched_at=r["fetched_at"],
            requested_start=r["requested_start"],
        )

    def set_coverage(self, cov: Coverage):
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT INTO coverage (provider, symbol, interval, adjustment_method,
                                      first_date, last_date, currency,
                                      exchange_timezone, fetched_at, requested_start)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider, symbol, interval, adjustment_method)
                DO UPDATE SET first_date=excluded.first_date,
                              last_date=excluded.last_date,
                              currency=excluded.currency,
                              exchange_timezone=excluded.exchange_timezone,
                              fetched_at=excluded.fetched_at,
                              requested_start=excluded.requested_start
                """,
                (
                    cov.provider, cov.symbol, cov.interval, cov.adjustment_method,
                    cov.first_date, cov.last_date, cov.currency,
                    cov.exchange_timezone, cov.fetched_at, cov.requested_start,
                ),
            )
