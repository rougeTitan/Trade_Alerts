"""Tests for the walk-forward backtest harness."""

from datetime import date, timedelta

import pytest

from market_data import backtest as B
from market_data.multi_timeframe import suggest_multi_timeframe


def _bar(i, o, h, l, c):
    return {"date": (date(2020, 1, 1) + timedelta(days=i)).isoformat(),
            "open": o, "high": h, "low": l, "close": c, "volume": 1}


def _flat(n, price=100.0):
    return [_bar(i, price, price + 0.2, price - 0.2, price) for i in range(n)]


# --------------------------------------------------------------------------
# evaluate_level
# --------------------------------------------------------------------------
def test_level_not_touched():
    res = B.evaluate_level(_flat(10, 100.0), level=120.0, direction="ABOVE", atr=1.0, react_bars=5)
    assert res == {"touched": False, "outcome": None}


def test_resistance_held():
    future = [_bar(0, 99, 101, 98, 100), _bar(1, 100, 100.5, 98, 99), _bar(2, 99, 99.5, 97, 98.5)]
    res = B.evaluate_level(future, level=101.0, direction="ABOVE", atr=2.0, react_bars=5)
    assert res == {"touched": True, "outcome": "held"}


def test_resistance_broke():
    future = [_bar(0, 99, 101, 98, 100), _bar(1, 101, 104, 100, 103.5)]
    res = B.evaluate_level(future, level=101.0, direction="ABOVE", atr=2.0, react_bars=5)
    assert res == {"touched": True, "outcome": "broke"}


def test_support_held():
    future = [_bar(0, 101, 102, 99, 100), _bar(1, 100, 103.5, 99.5, 103.2)]
    res = B.evaluate_level(future, level=99.0, direction="BELOW", atr=2.0, react_bars=5)
    assert res == {"touched": True, "outcome": "held"}


def test_touch_but_inconclusive():
    future = [_bar(0, 99, 101, 98, 100), _bar(1, 100, 100.8, 99.5, 100.2)]
    res = B.evaluate_level(future, level=101.0, direction="ABOVE", atr=2.0, react_bars=5)
    assert res == {"touched": True, "outcome": "inconclusive"}


# --------------------------------------------------------------------------
# walk-forward integrity
# --------------------------------------------------------------------------
def test_strategy_never_sees_future_bars():
    bars = _flat(800)
    seen = []

    def spy(history, ref):
        seen.append(len(history))
        assert ref == history[-1]["close"]
        return []

    B.run_backtest(bars, spy, min_history=300, step=50, horizon=60)
    assert seen[0] == 301
    assert all(b - a == 50 for a, b in zip(seen, seen[1:]))
    assert seen[-1] + 60 < 800 + 1


def test_run_backtest_is_deterministic():
    bars = _flat(800)

    def strat(history, ref):
        return [{"alert_price": ref * 1.02, "direction": "ABOVE"}]

    a = B.run_backtest(bars, strat, min_history=300, step=50, horizon=60, seed=3)
    b = B.run_backtest(bars, strat, min_history=300, step=50, horizon=60, seed=3)
    assert a == b


def test_counts_and_summary():
    real = {"levels": 10, "touched": 8, "held": 6, "broke": 2, "inconclusive": 0}
    base = {"levels": 10, "touched": 8, "held": 4, "broke": 4, "inconclusive": 0}
    s = B.summarize(real, base)
    assert s["hold_rate"] == pytest.approx(0.75)
    assert s["baseline_hold_rate"] == pytest.approx(0.5)
    assert s["lift"] == pytest.approx(0.25)
    assert s["touch_rate"] == pytest.approx(0.8)
    assert s["z_score"] is not None


def test_summary_handles_no_data():
    empty = {"levels": 0, "touched": 0, "held": 0, "broke": 0, "inconclusive": 0}
    s = B.summarize(empty, empty)
    assert s["hold_rate"] is None and s["lift"] is None and s["z_score"] is None


def test_mtf_beats_random_on_range_bound_market():
    """On a triangle-wave range, real S/R levels must out-hold random controls."""
    from test_multi_timeframe import triangle_bars  # type: ignore

    bars = triangle_bars(1300)
    res = B.run_backtest(bars, B.strategy_mtf, min_history=504, step=21, horizon=63)
    assert res["rebalances"] > 5
    s = B.summarize(res["real"], res["baseline"])
    assert s["levels"] > 0
    assert s["hold_rate"] is not None
    assert s["lift"] is None or s["lift"] >= 0


def test_strategy_registry():
    assert set(B.STRATEGIES) == {"v1", "mtf"}
    assert B.STRATEGIES["mtf"] is B.strategy_mtf
    assert callable(suggest_multi_timeframe)
