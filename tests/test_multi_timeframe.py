"""Tests for weekly resampling + multi-timeframe suggestions (algorithm v2)."""

from datetime import date, timedelta

import pytest

from market_data.errors import InsufficientHistoryError
from market_data import multi_timeframe as M


def _bar(d, o, h, l, c, v=1000):
    return {"date": d.isoformat(), "open": o, "high": h, "low": l, "close": c, "volume": v}


def _weekdays(start, n):
    out, d = [], start
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def triangle_bars(n, start=date(2019, 1, 7), lo=90.0, hi=110.0, period=40):
    """Triangle wave between lo and hi -> repeated, exactly-equal swing pivots."""
    half = period / 2.0
    bars = []
    for i, d in enumerate(_weekdays(start, n)):
        phase = (i % period) / half
        frac = phase if phase <= 1 else 2 - phase
        c = lo + (hi - lo) * frac
        bars.append(_bar(d, c, c + 0.5, c - 0.5, c))
    return bars


# --------------------------------------------------------------------------
# resample_weekly
# --------------------------------------------------------------------------
def test_resample_weekly_aggregates_ohlcv():
    days = _weekdays(date(2024, 1, 1), 10)  # Mon 1/1 .. Fri 1/12 (two full weeks)
    bars = [_bar(d, 10 + i, 20 + i, 5 + i, 11 + i, 100) for i, d in enumerate(days)]
    wk = M.resample_weekly(bars)
    assert len(wk) == 2
    assert wk[0]["open"] == 10 and wk[0]["close"] == 15
    assert wk[0]["high"] == 24 and wk[0]["low"] == 5
    assert wk[0]["volume"] == 500
    assert wk[0]["date"] == days[4].isoformat()


def test_resample_weekly_drops_partial_trailing_week():
    days = _weekdays(date(2024, 1, 1), 12)  # two full weeks + Mon, Tue
    bars = [_bar(d, 10, 11, 9, 10) for d in days]
    assert len(M.resample_weekly(bars)) == 2


def test_resample_weekly_keeps_week_ending_friday():
    days = _weekdays(date(2024, 1, 1), 15)  # three full weeks
    bars = [_bar(d, 10, 11, 9, 10) for d in days]
    assert len(M.resample_weekly(bars)) == 3


# --------------------------------------------------------------------------
# merge_zones
# --------------------------------------------------------------------------
def _zone(lo, hi, strength=1.0, visits=2):
    return {
        "zone_lower": lo, "zone_upper": hi, "median_price": (lo + hi) / 2,
        "independent_visits": visits, "strength_score": strength,
        "last_visit_date": "2024-01-01", "source": "historical_price_zone",
    }


def test_merge_confluence_gets_bonus_and_both_timeframes():
    daily = [_zone(109.5, 110.0, 1.0)]
    weekly = [_zone(109.8, 110.5, 1.0)]
    out = M.merge_zones(daily, weekly, tolerance=0.5)
    assert len(out) == 1
    z = out[0]
    assert z["timeframes"] == ["1d", "1wk"]
    assert z["zone_lower"] == 109.5 and z["zone_upper"] == 110.5
    expected = (1.0 + M.MTF_PARAMS["weekly_weight"] * 1.0) * M.MTF_PARAMS["confluence_bonus"]
    assert z["strength_score"] == pytest.approx(expected)


def test_merge_keeps_distant_zones_separate():
    out = M.merge_zones([_zone(90, 90.2)], [_zone(110, 110.2)], tolerance=0.5)
    assert sorted(z["timeframes"][0] for z in out) == ["1d", "1wk"]
    assert len(out) == 2


# --------------------------------------------------------------------------
# select_around
# --------------------------------------------------------------------------
def test_select_around_has_support_and_resistance_and_spacing():
    zones = [
        dict(_zone(110, 110.2, 5.0), timeframes=["1d"]),   # resistance
        dict(_zone(111, 111.2, 4.9), timeframes=["1d"]),   # too close to the first (< 1 ATR)
        dict(_zone(90, 90.2, 1.0), timeframes=["1d"]),     # weaker support
        dict(_zone(99.5, 100.5, 9.0), timeframes=["1d"]),  # straddles ref -> skipped
    ]
    sel = M.select_around(zones, ref=100.0, atr=2.0)
    dirs = [t["direction"] for t in sel]
    assert "ABOVE" in dirs and "BELOW" in dirs
    prices = [t["alert_price"] for t in sel]
    assert prices == sorted(prices)
    assert 99.5 not in prices and 100.5 not in prices
    assert all(abs(a - b) >= 2.0 for i, a in enumerate(prices) for b in prices[i + 1:])
    assert [t["rank"] for t in sel] == list(range(1, len(sel) + 1))


def test_select_alert_price_uses_near_edge_of_zone():
    zones = [dict(_zone(110, 112), timeframes=["1d"]), dict(_zone(88, 90), timeframes=["1d"])]
    sel = {t["direction"]: t["alert_price"] for t in M.select_around(zones, 100.0, atr=1.0)}
    assert sel["ABOVE"] == 110 and sel["BELOW"] == 90


# --------------------------------------------------------------------------
# suggest_multi_timeframe (end to end on a synthetic range-bound market)
# --------------------------------------------------------------------------
def test_mtf_finds_range_support_and_resistance_in_both_timeframes():
    bars = triangle_bars(1300)
    out = M.suggest_multi_timeframe(bars, reference_price=100.0)
    assert out["algorithm_version"] == M.MTF_ALGORITHM_VERSION
    assert out["weekly_bars_analyzed"] > 200
    targets = out["targets"]
    assert targets, "expected zones at the range extremes"
    above = [t for t in targets if t["direction"] == "ABOVE"]
    below = [t for t in targets if t["direction"] == "BELOW"]
    assert above and below
    assert abs(above[0]["alert_price"] - 109.5) < 1.5
    assert abs(below[0]["alert_price"] - 90.5) < 1.5
    assert all("1wk" in t["timeframes"] for t in targets)
    assert any("1d" in t["timeframes"] for t in targets)
    assert len(targets) <= 3


def test_mtf_insufficient_history():
    with pytest.raises(InsufficientHistoryError):
        M.suggest_multi_timeframe(triangle_bars(10))


def test_mtf_short_history_falls_back_to_daily_with_warning():
    out = M.suggest_multi_timeframe(triangle_bars(60), reference_price=100.0)
    assert any("weekly analysis skipped" in w for w in out["warnings"])


def test_mtf_endpoint_default_algorithm(client):
    from conftest import FakeProvider, provider_result, flat_rows  # type: ignore

    c = client(FakeProvider(provider_result(flat_rows(400))))
    r = c.get("/api/market-data/targets/suggest?symbol=AAPL&lookback_years=3")
    assert r.status_code in (200, 422)
    if r.status_code == 200:
        assert r.get_json()["algorithm_version"] == M.MTF_ALGORITHM_VERSION
    v1 = c.get("/api/market-data/targets/suggest?symbol=AAPL&algorithm=v1&lookback_years=3")
    assert v1.status_code in (200, 422)
    bad = c.get("/api/market-data/targets/suggest?symbol=AAPL&algorithm=nope")
    assert bad.status_code == 400
