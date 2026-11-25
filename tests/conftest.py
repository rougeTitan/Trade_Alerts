"""Shared fixtures + fakes for market-data tests.

All tests run against an isolated Flask app that registers ONLY the
market-data blueprint (never importing app.py), so the background monitor,
config.json, and email machinery are completely out of the picture — which is
also how we guarantee the preview endpoint can't touch alerts or send email.
"""

import os
import sys
from datetime import date, datetime, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from market_data.cache import BarCache  # noqa: E402
from market_data.provider import HistoricalDataProvider, ProviderResult, RawBar  # noqa: E402
from market_data.service import MarketDataService  # noqa: E402


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class FakeProvider(HistoricalDataProvider):
    name = "yahoo_finance"
    adjustment_method = "yfinance_auto_adjust"

    def __init__(self, result=None, exc=None):
        self.result = result
        self.exc = exc
        self.calls = 0

    def fetch_daily(self, symbol, start, end):
        self.calls += 1
        if self.exc is not None:
            raise self.exc
        return self.result


def raw_bars(rows):
    """rows: iterable of (date, o, h, l, c, v)."""
    return [RawBar(date=d, open=o, high=h, low=l, close=c, volume=v)
            for (d, o, h, l, c, v) in rows]


def provider_result(rows, currency="USD", tz="America/New_York", warnings=None):
    return ProviderResult(bars=raw_bars(rows), currency=currency,
                          exchange_timezone=tz, warnings=warnings or [])


# A Friday 16:00 ET (= 20:00 UTC during EDT): session for 2024-06-14 is done.
FIXED_NOW_AFTER_CLOSE = datetime(2024, 6, 14, 20, 0, tzinfo=timezone.utc)
# A Friday 10:00 ET (= 14:00 UTC): 2024-06-14 session is still open.
FIXED_NOW_BEFORE_CLOSE = datetime(2024, 6, 14, 14, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def cache(tmp_path):
    c = BarCache(str(tmp_path / "test_market_data.db"))
    yield c
    c.close()


@pytest.fixture
def make_service(cache):
    def _make(provider, now=FIXED_NOW_AFTER_CLOSE):
        return MarketDataService(provider, cache, now_fn=lambda: now)
    return _make


@pytest.fixture
def client(make_service):
    """Flask test client wired to an injectable service."""
    from flask import Flask
    from market_data.routes import market_data_bp, set_service

    app = Flask(__name__)
    app.register_blueprint(market_data_bp)
    app.testing = True

    def _bind(provider, now=FIXED_NOW_AFTER_CLOSE):
        set_service(make_service(provider, now))
        return app.test_client()

    yield _bind
    set_service(None)


# ---------------------------------------------------------------------------
# Synthetic candle generators
# ---------------------------------------------------------------------------
def trading_days(start: date, n: int):
    """n consecutive weekdays starting at `start` (skips weekends)."""
    out = []
    d = start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += __import__("datetime").timedelta(days=1)
    return out


def flat_rows(n, start=date(2022, 1, 3), base=100.0):
    """n weekday bars with constant TR=1.5 (open=base, high/low +/-, close mid)."""
    rows = []
    for d in trading_days(start, n):
        rows.append((d.isoformat(), base, base + 1.0, base, base + 0.5, 1000))
    return rows
