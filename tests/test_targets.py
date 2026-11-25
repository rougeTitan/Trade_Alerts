"""Phase 2 — target calculation unit tests + read-only preview endpoint."""

from datetime import date, timedelta

import pytest

from conftest import FakeProvider, provider_result, flat_rows
from market_data import targets as T
from market_data.errors import InsufficientHistoryError


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _weekdays(n, end=date(2024, 6, 14)):
    """n weekdays ending (inclusive) at `end` so data lands inside the default
    2-year lookback window relative to the fixed test clock."""
    out, d = [], end
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    out.reverse()
    return out


def bars_from(highs, lows, closes, opens=None):
    days = _weekdays(len(highs))
    opens = opens or closes
    return [
        {"date": days[i].isoformat(), "open": opens[i], "high": highs[i],
         "low": lows[i], "close": closes[i], "volume": 1000}
        for i in range(len(highs))
    ]


# ---------------------------------------------------------------------------
# ATR
# ---------------------------------------------------------------------------
def test_wilder_atr_constant_true_range():
    rows = flat_rows(30)  # TR is a constant 1.0 for a flat series
    highs = [r[2] for r in rows]
    lows = [r[3] for r in rows]
    closes = [r[4] for r in rows]
    atr = T.wilder_atr(highs, lows, closes, period=14)
    assert atr[13] is None            # not seeded before period
    assert atr[14] == pytest.approx(1.0)
    assert atr[-1] == pytest.approx(1.0)


def test_wilder_atr_needs_enough_bars():
    rows = flat_rows(10)
    atr = T.wilder_atr([r[2] for r in rows], [r[3] for r in rows], [r[4] for r in rows], 14)
    assert all(a is None for a in atr)


# ---------------------------------------------------------------------------
# swing detection + no look-ahead
# ---------------------------------------------------------------------------
def test_strict_swing_high_detected_mid_series():
    highs = [1, 2, 3, 4, 5, 6, 7, 100, 7, 6, 5, 4, 3, 2, 1]
    lows = [h - 0.5 for h in highs]
    closes = highs
    bars = bars_from(highs, lows, closes)
    sh, _ = T.find_swings(bars, strength=5)
    assert [p["index"] for p in sh] == [7]


def test_swing_not_confirmed_without_five_right_candles():
    # peak at index 12 of 15 -> only 2 right candles -> must NOT be reported
    highs = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 3, 4, 100, 4, 3]
    lows = [h - 0.5 for h in highs]
    bars = bars_from(highs, lows, highs)
    sh, _ = T.find_swings(bars, strength=5)
    assert all(p["index"] != 12 for p in sh)


# ---------------------------------------------------------------------------
# clustering (bounded total span, not chain merge)
# ---------------------------------------------------------------------------
def test_cluster_bounded_span():
    pivots = [{"index": i, "price": p, "date": "d"} for i, p in
              enumerate([100.0, 100.3, 100.6, 100.9, 105.0])]
    clusters = T.cluster_pivots(pivots, max_span=0.5)
    spans = [max(m["price"] for m in c) - min(m["price"] for m in c) for c in clusters]
    assert all(s <= 0.5 + 1e-9 for s in spans)      # never oversized
    # 100.0/100.3 then 100.6/100.9 then 105.0  -> 3 clusters
    assert len(clusters) == 3


# ---------------------------------------------------------------------------
# independent visits
# ---------------------------------------------------------------------------
def test_independent_visit_counting():
    members = [{"index": i, "price": 100.0, "date": "d"} for i in (10, 11, 50, 51, 52)]
    visits = T.independent_visits(members, separation_bars=5)
    assert len(visits) == 2


# ---------------------------------------------------------------------------
# ordering + spacing
# ---------------------------------------------------------------------------
def _zone(lower, upper, visits=2):
    return {"zone_lower": lower, "zone_upper": upper, "median_price": (lower + upper) / 2,
            "independent_visits": visits, "strength_score": 1.0,
            "last_visit_date": "2024-01-01", "source": "historical_price_zone"}


def test_upside_ordering_and_spacing():
    zones = [_zone(103, 103), _zone(104, 104), _zone(107, 107), _zone(110, 110)]
    selected, reason = T.select_targets(zones, "up", reference_price=100, latest_atr=2.0)
    assert [t["alert_price"] for t in selected] == [103, 107, 110]   # 104 dropped (<1 ATR)
    assert [t["rank"] for t in selected] == [1, 2, 3]
    assert reason is None


def test_downside_ordering_and_spacing():
    zones = [_zone(97, 97), _zone(96, 96), _zone(93, 93), _zone(90, 90)]
    selected, _ = T.select_targets(zones, "down", reference_price=100, latest_atr=2.0)
    assert [t["alert_price"] for t in selected] == [97, 93, 90]      # 96 dropped


def test_fewer_than_three_targets_has_reason():
    zones = [_zone(105, 105)]
    selected, reason = T.select_targets(zones, "up", reference_price=100, latest_atr=1.0)
    assert len(selected) == 1
    assert reason is not None and "synthetic" in reason


# ---------------------------------------------------------------------------
# preview_targets end to end
# ---------------------------------------------------------------------------
def _double_top_bars(n=40, peaks=(10, 25), peak_high=112.0, plateau=104.0):
    highs = [peak_high if i in peaks else plateau for i in range(n)]
    lows = [100.0] * n
    closes = [102.0] * n
    opens = [101.0] * n
    return bars_from(highs, lows, closes, opens)


def test_preview_insufficient_history():
    bars = bars_from([101] * 10, [99] * 10, [100] * 10)
    with pytest.raises(InsufficientHistoryError):
        T.preview_targets(bars, "up")


def test_preview_flat_series_yields_no_targets():
    rows = flat_rows(40)
    bars = [{"date": r[0], "open": r[1], "high": r[2], "low": r[3],
             "close": r[4], "volume": r[5]} for r in rows]
    out = T.preview_targets(bars, "up")
    assert out["targets"] == []
    assert out["reason"] is not None


def test_preview_double_top_resistance():
    out = T.preview_targets(_double_top_bars(), "up")
    assert out["reference_price"] == 102.0
    assert out["reference_price_source"] == "latest_completed_close"
    assert len(out["targets"]) == 1
    t = out["targets"][0]
    assert t["alert_price"] == pytest.approx(112.0)
    assert t["independent_visits"] == 2
    assert t["source"] == "historical_price_zone"


def test_preview_user_reference_price_source():
    out = T.preview_targets(_double_top_bars(), "up", reference_price=90.0)
    assert out["reference_price_source"] == "user_supplied"


# ---------------------------------------------------------------------------
# endpoint: read-only (no persistence / no email) + wiring
# ---------------------------------------------------------------------------
def test_preview_endpoint_readonly(client):
    rows = [(b["date"], b["open"], b["high"], b["low"], b["close"], b["volume"])
            for b in _double_top_bars()]
    c = client(FakeProvider(provider_result(rows)))
    r = c.get("/api/market-data/targets/preview?symbol=AAPL&direction=up")
    assert r.status_code == 200
    body = r.get_json()
    assert body["direction"] == "up"
    assert body["targets"][0]["alert_price"] == pytest.approx(112.0)
    # read-only guarantees: nothing about saving/activating/emailing
    for forbidden in ("saved", "activated", "email_sent", "alert_created"):
        assert forbidden not in body
    assert "ranking score" in body["strength_note"]


def _top_and_bottom_bars(n=40, tops=(10, 25), bottoms=(15, 32),
                         top_high=112.0, bottom_low=88.0):
    highs = [top_high if i in tops else 104.0 for i in range(n)]
    lows = [bottom_low if i in bottoms else 96.0 for i in range(n)]
    closes = [100.0] * n
    opens = [100.0] * n
    return bars_from(highs, lows, closes, opens)


def test_suggest_merges_support_and_resistance():
    out = T.suggest_targets(_top_and_bottom_bars())
    dirs = {t["direction"] for t in out["targets"]}
    prices = sorted(t["alert_price"] for t in out["targets"])
    assert dirs == {"ABOVE", "BELOW"}
    assert prices == [pytest.approx(88.0), pytest.approx(112.0)]
    # ordered by price, ranks assigned
    assert [t["rank"] for t in out["targets"]] == [1, 2]


def test_suggest_insufficient_history():
    bars = bars_from([101] * 10, [99] * 10, [100] * 10)
    with pytest.raises(InsufficientHistoryError):
        T.suggest_targets(bars)


def test_suggest_batch_endpoint_mixed(cache):
    """Batch returns per-symbol results; one bad symbol must not fail the rest."""
    from flask import Flask
    from market_data.routes import market_data_bp, set_service
    from market_data.service import MarketDataService
    from market_data.provider import HistoricalDataProvider
    from market_data.errors import SymbolNotFoundError
    from conftest import FIXED_NOW_AFTER_CLOSE, provider_result

    good_rows = [(b["date"], b["open"], b["high"], b["low"], b["close"], b["volume"])
                 for b in _top_and_bottom_bars()]

    class MixedProvider(HistoricalDataProvider):
        name = "yahoo_finance"
        adjustment_method = "yfinance_auto_adjust"

        def fetch_daily(self, symbol, start, end):
            if symbol == "BAD":
                raise SymbolNotFoundError("no such symbol")
            return provider_result(good_rows)

    svc = MarketDataService(MixedProvider(), cache, now_fn=lambda: FIXED_NOW_AFTER_CLOSE)
    set_service(svc)
    app = Flask(__name__)
    app.register_blueprint(market_data_bp)
    app.testing = True
    c = app.test_client()

    r = c.get("/api/market-data/targets/suggest-batch?symbols=AAPL,BAD,AAPL")
    set_service(None)
    assert r.status_code == 200
    body = r.get_json()
    assert body["count"] == 2                      # de-duped
    assert body["succeeded"] == 1
    assert body["results"]["AAPL"]["targets"]
    assert body["results"]["BAD"]["error"]["code"] == "symbol_not_found"


def test_suggest_batch_requires_symbols(client):
    c = client(FakeProvider(provider_result([])))
    assert c.get("/api/market-data/targets/suggest-batch").status_code == 400


def test_preview_endpoint_invalid_direction(client):
    rows = [(b["date"], b["open"], b["high"], b["low"], b["close"], b["volume"])
            for b in _double_top_bars()]
    c = client(FakeProvider(provider_result(rows)))
    r = c.get("/api/market-data/targets/preview?symbol=AAPL&direction=sideways")
    assert r.status_code == 400
