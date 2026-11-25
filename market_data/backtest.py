"""Walk-forward backtest harness for suggested support/resistance levels.

Question answered: when price actually reaches a suggested level, does it
react (hold) more often than it would at a *comparable random level*?

Method (no look-ahead):
  * At each rebalance bar t, the strategy sees ONLY bars[: t + 1] and returns
    levels [{alert_price, direction}].
  * For the next `horizon` bars we look for the first bar whose range touches
    the level. After the touch, on closes of the next `react_bars` bars:
      held   = price moves >= 1 ATR(t) in the expected direction first
               (ABOVE/resistance -> down, BELOW/support -> up)
      broke  = price moves >= 1 ATR(t) through the level first
      neither = inconclusive (excluded from hold_rate)
  * Baseline: for every real level a control level on the same side at a random
    distance in [0.5, 1.5] x the real distance, evaluated identically.
  * hold_rate = held / (held + broke); lift = real - baseline.

Run from the repo root:
    python -m market_data.backtest --symbols AAPL,MSFT --years 5
    python -m market_data.backtest --sectors-file sectors.json --limit 30
"""

import argparse
import json
import math
import os
import random
from typing import Callable, Dict, List, Optional

from . import targets as t1
from .errors import MarketDataError
from .multi_timeframe import suggest_multi_timeframe

LevelFn = Callable[[List[dict], float], List[dict]]

DEFAULTS = {
    "min_history": 504,   # bars required before the first rebalance (~2y daily)
    "step": 21,           # rebalance every ~month
    "horizon": 63,        # look ahead ~3 months for a touch
    "react_bars": 5,      # bars after a touch to judge the reaction
    "seed": 7,
}


# ---------------------------------------------------------------------------
# Strategies (bars_up_to_t, reference_price) -> [{alert_price, direction}]
# ---------------------------------------------------------------------------
def strategy_v1(bars, ref):
    return t1.suggest_targets(bars, ref)["targets"]


def strategy_mtf(bars, ref):
    return suggest_multi_timeframe(bars, ref)["targets"]


STRATEGIES: Dict[str, LevelFn] = {"v1": strategy_v1, "mtf": strategy_mtf}


# ---------------------------------------------------------------------------
# Single-level evaluation
# ---------------------------------------------------------------------------
def evaluate_level(future_bars, level: float, direction: str, atr: float,
                   react_bars: int) -> dict:
    """Return {"touched": bool, "outcome": held|broke|inconclusive|None}."""
    for k, b in enumerate(future_bars):
        if b["low"] <= level <= b["high"]:
            closes = [x["close"] for x in future_bars[k + 1: k + 1 + react_bars]]
            toward = -1.0 if direction == "ABOVE" else 1.0  # expected move sign
            for c in closes:
                move = (c - level) * toward
                if move >= atr:
                    return {"touched": True, "outcome": "held"}
                if move <= -atr:
                    return {"touched": True, "outcome": "broke"}
            return {"touched": True, "outcome": "inconclusive"}
    return {"touched": False, "outcome": None}


def _empty_counts():
    return {"levels": 0, "touched": 0, "held": 0, "broke": 0, "inconclusive": 0}


def _add(counts, res):
    counts["levels"] += 1
    if res["touched"]:
        counts["touched"] += 1
        counts[res["outcome"]] += 1


def merge_counts(a, b):
    return {k: a[k] + b[k] for k in a}


# ---------------------------------------------------------------------------
# Walk-forward over one symbol
# ---------------------------------------------------------------------------
def run_backtest(bars: List[dict], strategy: LevelFn, min_history: int = DEFAULTS["min_history"],
                 step: int = DEFAULTS["step"], horizon: int = DEFAULTS["horizon"],
                 react_bars: int = DEFAULTS["react_bars"], seed: int = DEFAULTS["seed"]) -> dict:
    rng = random.Random(seed)
    real, base = _empty_counts(), _empty_counts()
    rebalances = 0
    n = len(bars)

    t = min_history
    while t + horizon < n:
        history = bars[: t + 1]
        ref = history[-1]["close"]
        try:
            levels = strategy(history, ref)
        except MarketDataError:
            t += step
            continue
        if levels:
            rebalances += 1
            highs = [b["high"] for b in history]
            lows = [b["low"] for b in history]
            closes = [b["close"] for b in history]
            atr = t1.wilder_atr(highs, lows, closes, 14)[-1]
            future = bars[t + 1: t + 1 + horizon]
            for lv in levels:
                price, direction = lv["alert_price"], lv["direction"]
                _add(real, evaluate_level(future, price, direction, atr, react_bars))
                dist = abs(price - ref)
                ctrl_dist = dist * rng.uniform(0.5, 1.5)
                ctrl = ref + ctrl_dist if direction == "ABOVE" else ref - ctrl_dist
                if ctrl > 0:
                    _add(base, evaluate_level(future, ctrl, direction, atr, react_bars))
        t += step

    return {"rebalances": rebalances, "real": real, "baseline": base}


# ---------------------------------------------------------------------------
# Summary statistics
# ---------------------------------------------------------------------------
def _rate(num, den):
    return num / den if den else None


def summarize(real: dict, base: dict) -> dict:
    r_hold = _rate(real["held"], real["held"] + real["broke"])
    b_hold = _rate(base["held"], base["held"] + base["broke"])
    lift = (r_hold - b_hold) if (r_hold is not None and b_hold is not None) else None

    z = None
    n1, n2 = real["held"] + real["broke"], base["held"] + base["broke"]
    if n1 and n2 and r_hold is not None and b_hold is not None:
        pooled = (real["held"] + base["held"]) / (n1 + n2)
        se = math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
        z = (r_hold - b_hold) / se if se > 0 else None

    return {
        "levels": real["levels"],
        "touch_rate": _rate(real["touched"], real["levels"]),
        "hold_rate": r_hold,
        "baseline_touch_rate": _rate(base["touched"], base["levels"]),
        "baseline_hold_rate": b_hold,
        "lift": lift,
        "z_score": z,
        "reacted_samples": n1,
        "baseline_reacted_samples": n2,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _symbols_from_sectors(path: str, limit: Optional[int]) -> List[str]:
    with open(path, "r") as f:
        data = json.load(f)
    seen, out = set(), []
    for tickers in data.values():
        for t in tickers:
            if t not in seen:
                seen.add(t)
                out.append(t)
    return out[:limit] if limit else out


def _fmt(v, pct=True):
    if v is None:
        return "n/a"
    return f"{v * 100:.1f}%" if pct else f"{v:.2f}"


def main(argv=None):
    ap = argparse.ArgumentParser(description="Walk-forward backtest of suggested S/R levels")
    ap.add_argument("--symbols", help="comma-separated tickers")
    ap.add_argument("--sectors-file", help="sectors.json to take tickers from")
    ap.add_argument("--limit", type=int, help="max tickers from the sectors file")
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--strategies", default="v1,mtf")
    ap.add_argument("--step", type=int, default=DEFAULTS["step"])
    ap.add_argument("--horizon", type=int, default=DEFAULTS["horizon"])
    ap.add_argument("--json", action="store_true", help="print raw JSON summary")
    args = ap.parse_args(argv)

    if args.symbols:
        symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    elif args.sectors_file:
        symbols = _symbols_from_sectors(args.sectors_file, args.limit)
    else:
        ap.error("provide --symbols or --sectors-file")

    from .cache import BarCache
    from .provider import YahooFinanceProvider
    from .service import MarketDataService

    service = MarketDataService(
        YahooFinanceProvider(), BarCache(os.environ.get("MARKET_DATA_DB", "market_data.db"))
    )
    names = [s.strip() for s in args.strategies.split(",") if s.strip()]
    totals = {n: (_empty_counts(), _empty_counts()) for n in names}

    for sym in symbols:
        try:
            bars = service.get_history(sym, args.years).completed_bars
        except MarketDataError as e:
            print(f"  skip {sym}: {e}")
            continue
        for name in names:
            res = run_backtest(bars, STRATEGIES[name], step=args.step, horizon=args.horizon)
            r, b = totals[name]
            totals[name] = (merge_counts(r, res["real"]), merge_counts(b, res["baseline"]))
        print(f"  done {sym} ({len(bars)} bars)")

    summaries = {n: summarize(*totals[n]) for n in names}
    if args.json:
        print(json.dumps(summaries, indent=2))
        return summaries

    print(f"\nSymbols: {len(symbols)}  years: {args.years}  step: {args.step}  horizon: {args.horizon}")
    print(f"{'strategy':<8} {'levels':>7} {'touch':>7} {'hold':>7} {'base hold':>10} {'lift':>7} {'z':>6}")
    for n, s in summaries.items():
        print(f"{n:<8} {s['levels']:>7} {_fmt(s['touch_rate']):>7} {_fmt(s['hold_rate']):>7} "
              f"{_fmt(s['baseline_hold_rate']):>10} {_fmt(s['lift']):>7} {_fmt(s['z_score'], False):>6}")
    print("\nlift = hold_rate - baseline_hold_rate (distance-matched random levels); "
          "z > ~2 suggests the edge is unlikely to be chance.")
    return summaries


if __name__ == "__main__":
    main()
