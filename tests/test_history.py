"""Phase 1 — history endpoint + service tests (mocked provider)."""

from datetime import date, timedelta

import pytest

from conftest import (
    FIXED_NOW_AFTER_CLOSE,
    FIXED_NOW_BEFORE_CLOSE,
    FakeProvider,
    provider_result,
)
from market_data.errors import (
    ProviderThrottledError,
    ProviderUnavailableError,
    SymbolNotFoundError,
)
from market_data.provider import YahooFinanceProvider


def weekday_rows_ending(end: date, n: int, base=100.0):
    """n weekday bars ending (inclusive) at `end`, chronological."""
    days = []
    d = end
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    days.reverse()
    rows = []
    for i, dd in enumerate(days):
        price = base + i  # strictly rising so OHLC is well-formed
        rows.append((dd.isoformat(), price, price + 1.0, price - 1.0, price + 0.5, 1000 + i))
    return rows


def test_valid_history(client):
    rows = weekday_rows_ending(date(2024, 6, 14), 30)
    c = client(FakeProvider(provider_result(rows)))
    r = c.get("/api/market-data/history?symbol=aapl&lookback_years=2&limit=10")
    assert r.status_code == 200
    body = r.get_json()
    assert body["symbol"] == "AAPL"
    assert body["provider"] == "yahoo_finance"
    assert body["interval"] == "1d"
    assert body["adjustment_method"] == "yfinance_auto_adjust"
    assert body["currency"] == "USD"
    assert body["exchange_timezone"] == "America/New_York"
    assert body["total_bars"] == 30
    assert body["returned_bars"] == 10
    assert body["cache_hit"] is False
    assert body["last_bar_date"] == "2024-06-14"
    # chronological
    dates = [b["date"] for b in body["bars"]]
    assert dates == sorted(dates)
    # latest completed close = last bar close (session finished at fixed now)
    assert body["latest_completed_close"] == rows[-1][4]


def test_invalid_params(client):
    c = client(FakeProvider(provider_result(weekday_rows_ending(date(2024, 6, 14), 20))))
    assert c.get("/api/market-data/history").status_code == 400          # missing symbol
    assert c.get("/api/market-data/history?symbol=AAPL&lookback_years=0").status_code == 400
    assert c.get("/api/market-data/history?symbol=AAPL&lookback_years=6").status_code == 400
    assert c.get("/api/market-data/history?symbol=AAPL&limit=2000").status_code == 400
    assert c.get("/api/market-data/history?symbol=AAPL&limit=abc").status_code == 400
    body = c.get("/api/market-data/history?symbol=AAPL&limit=0").get_json()
    assert body["error"]["code"] == "invalid_parameter"
    assert body["error"]["retryable"] is False


def test_empty_provider_response(client):
    c = client(FakeProvider(provider_result([])))
    r = c.get("/api/market-data/history?symbol=NOPE")
    assert r.status_code == 404
    assert r.get_json()["error"]["code"] == "no_history"


def test_provider_throttled(client):
    c = client(FakeProvider(exc=ProviderThrottledError("rate limited")))
    r = c.get("/api/market-data/history?symbol=AAPL")
    assert r.status_code == 503
    err = r.get_json()["error"]
    assert err["code"] == "provider_throttled"
    assert err["retryable"] is True


def test_provider_unavailable_not_mislabeled(client):
    c = client(FakeProvider(exc=ProviderUnavailableError("connection reset")))
    r = c.get("/api/market-data/history?symbol=AAPL")
    assert r.status_code == 502
    assert r.get_json()["error"]["code"] == "provider_unavailable"  # NOT symbol_not_found


def test_cache_hit_and_refresh(make_service):
    rows = weekday_rows_ending(date(2024, 6, 14), 30)
    provider = FakeProvider(provider_result(rows))
    svc = make_service(provider)

    r1 = svc.get_history("AAPL", 2, refresh=False)
    assert provider.calls == 1
    assert r1.cache_hit is False

    # Second call within TTL and no new session -> served from cache.
    r2 = svc.get_history("AAPL", 2, refresh=False)
    assert provider.calls == 1
    assert r2.cache_hit is True

    # Explicit refresh forces a fresh upstream fetch (adjusted history revision).
    r3 = svc.get_history("AAPL", 2, refresh=True)
    assert provider.calls == 2
    assert r3.cache_hit is False


def test_duplicate_and_malformed_bars(make_service):
    good = weekday_rows_ending(date(2024, 6, 14), 20)
    # duplicate last date with a different close (last one must win)
    dup = (good[-1][0], 500.0, 501.0, 499.0, 500.5, 1)
    # malformed OHLC: high below open/close -> must be dropped with a warning
    malformed = ("2024-06-10", 100.0, 90.0, 95.0, 99.0, 10)
    # NaN volume: bar kept, volume -> null
    nan_vol = ("2024-06-11", 100.0, 101.0, 99.0, 100.5, float("nan"))
    rows = good + [dup, malformed, nan_vol]
    svc = make_service(FakeProvider(provider_result(rows)))
    res = svc.get_history("AAPL", 2, refresh=False)

    by_date = {b["date"]: b for b in res.bars}
    assert by_date[good[-1][0]]["close"] == 500.5           # dedup, last wins
    assert "2024-06-10" not in by_date                      # malformed dropped
    assert by_date["2024-06-11"]["volume"] is None          # NaN -> null
    assert any("inconsistent OHLC" in w for w in res.warnings)


def test_classify_verified_missing_vs_outage():
    """A verified-missing yfinance error -> 404; a transport outage -> 502."""
    classify = YahooFinanceProvider._classify

    class YFTzMissingError(Exception):
        pass

    missing = classify(YFTzMissingError("$ZZZZ: possibly delisted; no timezone found"))
    assert isinstance(missing, SymbolNotFoundError)

    throttled = classify(Exception("Too Many Requests. Rate limited."))
    assert isinstance(throttled, ProviderThrottledError)

    # Generic network failure must NOT be downgraded to symbol-not-found.
    outage = classify(ConnectionResetError("connection reset by peer"))
    assert isinstance(outage, ProviderUnavailableError)


def test_unfinished_candle_excluded(make_service):
    rows = weekday_rows_ending(date(2024, 6, 14), 30)
    # Market still open on 2024-06-14 -> that candle is unfinished.
    svc = make_service(FakeProvider(provider_result(rows)), now=FIXED_NOW_BEFORE_CLOSE)
    res = svc.get_history("AAPL", 2, refresh=False)

    assert res.last_bar_date == "2024-06-14"                 # still returned in bars
    assert res.completed_bars[-1]["date"] == "2024-06-13"    # excluded from completed
    assert res.latest_completed_close == rows[-2][4]
    assert any("unfinished session" in w for w in res.warnings)
