"""Deterministic historical support/resistance target generation (algorithm v1).

Pure functions over a list of *completed* daily OHLC bars. No I/O, no provider
calls, no rounding of intermediate values (callers round only the returned
prices). Strength is a ranking score, NOT a probability or confidence.

Pipeline (see module-level ALGO_PARAMS):
  ATR(14, Wilder) -> strict 5/5 swing pivots -> price clustering bounded by
  0.5*ATR -> independent-visit counting -> time-decayed strength -> directional
  filtering, distance ordering, >=1*ATR spacing, top 3.
"""

from statistics import mean, median
from typing import List, Optional

from . import ALGORITHM_VERSION
from .errors import InsufficientHistoryError

ALGO_PARAMS = {
    "atr_period": 14,
    "swing_strength": 5,          # candles on each side for a strict pivot
    "cluster_max_span_atr": 0.5,  # max total zone width = 0.5 * latest ATR
    "min_independent_visits": 2,
    "visit_separation_bars": 5,   # pivots < this many bars apart = one visit
    "decay_halflife_bars": 126,   # ~6 trading months
    "min_spacing_atr": 1.0,       # min gap between selected alert prices
    "max_targets": 3,
}


# ---------------------------------------------------------------------------
# ATR (Wilder)
# ---------------------------------------------------------------------------
def true_ranges(highs, lows, closes) -> List[Optional[float]]:
    n = len(closes)
    trs: List[Optional[float]] = [None]  # first bar has no prior close
    for i in range(1, n):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    return trs


def wilder_atr(highs, lows, closes, period: int = 14) -> List[Optional[float]]:
    """Return the ATR series (same length as input; None until seeded).

    Seed = mean of the first `period` true ranges (bars 1..period), then Wilder
    smoothing: ATR_i = (ATR_{i-1} * (period-1) + TR_i) / period.
    """
    n = len(closes)
    atr: List[Optional[float]] = [None] * n
    if n < period + 1:
        return atr
    trs = true_ranges(highs, lows, closes)
    seed = mean(trs[1:period + 1])
    atr[period] = seed
    for i in range(period + 1, n):
        atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period
    return atr


# ---------------------------------------------------------------------------
# Swing (pivot) detection — strict, 5 candles each side, no look-ahead
# ---------------------------------------------------------------------------
def find_swings(bars, strength: int = 5):
    """Return (swing_highs, swing_lows) as pivot dicts.

    A pivot at index i requires `strength` candles on each side; since callers
    pass only completed bars, requiring the right-hand candles to exist means a
    swing is confirmed only after its right-hand window has completed. No
    future information is used.
    """
    highs = [b["high"] for b in bars]
    lows = [b["low"] for b in bars]
    n = len(bars)
    swing_highs = []
    swing_lows = []
    for i in range(strength, n - strength):
        window = range(i - strength, i + strength + 1)
        if all(highs[i] > highs[j] for j in window if j != i):
            swing_highs.append({"index": i, "date": bars[i]["date"], "price": highs[i], "type": "high"})
        if all(lows[i] < lows[j] for j in window if j != i):
            swing_lows.append({"index": i, "date": bars[i]["date"], "price": lows[i], "type": "low"})
    return swing_highs, swing_lows


# ---------------------------------------------------------------------------
# Clustering — bounded total span (NOT pairwise chain merging)
# ---------------------------------------------------------------------------
def cluster_pivots(pivots, max_span: float):
    """Group pivots into zones so each zone's total price span (max-min member
    price) stays <= `max_span`. Avoids chain merging that would grow unbounded.
    """
    clusters = []
    cur = []
    for p in sorted(pivots, key=lambda x: x["price"]):
        if not cur:
            cur = [p]
            continue
        if p["price"] - cur[0]["price"] <= max_span:
            cur.append(p)
        else:
            clusters.append(cur)
            cur = [p]
    if cur:
        clusters.append(cur)
    return clusters


# ---------------------------------------------------------------------------
# Independent-visit counting + strength
# ---------------------------------------------------------------------------
def independent_visits(members, separation_bars: int = 5):
    """Split a zone's pivots into independent visits.

    Pivots whose trading-bar index gap is < `separation_bars` collapse into one
    visit. Returns a list of visits; each visit is the list of its pivots
    (sorted by index).
    """
    members_sorted = sorted(members, key=lambda m: m["index"])
    visits = []
    cur = [members_sorted[0]]
    for p in members_sorted[1:]:
        if p["index"] - cur[-1]["index"] < separation_bars:
            cur.append(p)
        else:
            visits.append(cur)
            cur = [p]
    visits.append(cur)
    return visits


def zone_strength(visits, last_completed_index: int, halflife_bars: int = 126) -> float:
    """Sum of time-decayed weights over independent visits.

    weight = 0.5 ** (age_in_trading_bars / halflife); a visit's age uses the
    most recent pivot in that visit.
    """
    total = 0.0
    for v in visits:
        rep_index = v[-1]["index"]  # most recent touch in the visit
        age = last_completed_index - rep_index
        total += 0.5 ** (age / halflife_bars)
    return total


# ---------------------------------------------------------------------------
# Top-level target generation
# ---------------------------------------------------------------------------
def build_zones(bars, latest_atr, last_completed_index, params=ALGO_PARAMS):
    """Build qualifying zones (>= min_independent_visits) from swing pivots."""
    highs, lows = find_swings(bars, params["swing_strength"])
    pivots = highs + lows
    if not pivots:
        return []

    max_span = params["cluster_max_span_atr"] * latest_atr
    zones = []
    for cluster in cluster_pivots(pivots, max_span):
        visits = independent_visits(cluster, params["visit_separation_bars"])
        if len(visits) < params["min_independent_visits"]:
            continue
        prices = [m["price"] for m in cluster]
        last_visit_date = max(cluster, key=lambda m: m["index"])["date"]
        zones.append({
            "zone_lower": min(prices),
            "zone_upper": max(prices),
            "median_price": median(prices),
            "independent_visits": len(visits),
            "strength_score": zone_strength(visits, last_completed_index, params["decay_halflife_bars"]),
            "last_visit_date": last_visit_date,
            "source": "historical_price_zone",
        })
    return zones


def select_targets(zones, direction, reference_price, latest_atr, params=ALGO_PARAMS):
    """Filter by direction, order by distance, enforce >=1*ATR spacing, top 3.

    Returns (targets, reason) where `reason` is None when 3 were selected or a
    human explanation when fewer qualify.
    """
    direction = direction.lower()
    if direction == "up":
        qualifying = [z for z in zones if z["zone_lower"] > reference_price]
        qualifying.sort(key=lambda z: z["zone_lower"])              # closest above first
        alert_key = "zone_lower"
    else:
        qualifying = [z for z in zones if z["zone_upper"] < reference_price]
        qualifying.sort(key=lambda z: z["zone_upper"], reverse=True)  # closest below first
        alert_key = "zone_upper"

    min_spacing = params["min_spacing_atr"] * latest_atr
    selected = []
    for z in qualifying:
        alert = z[alert_key]
        if selected and abs(alert - selected[-1]["alert_price"]) < min_spacing:
            continue
        t = dict(z)
        t["alert_price"] = alert
        selected.append(t)
        if len(selected) >= params["max_targets"]:
            break

    for rank, t in enumerate(selected, start=1):
        t["rank"] = rank

    reason = None
    if len(selected) < params["max_targets"]:
        side = "above" if direction == "up" else "below"
        reason = (
            f"only {len(selected)} qualifying historical zone(s) found "
            f"{side} the reference price with >= {params['min_independent_visits']} "
            f"independent visits and >= {params['min_spacing_atr']}x ATR spacing; "
            "no synthetic percentage/ATR extensions were added"
        )
    return selected, reason


def suggest_targets(completed_bars, reference_price=None, params=ALGO_PARAMS):
    """Suggest up to 3 of the nearest zones *around* the reference price.

    Unlike `preview_targets` (single direction), this merges resistance
    (above -> ABOVE) and support (below -> BELOW) zones, orders them by
    absolute distance from the reference, enforces >= 1x ATR spacing across the
    merged set, and returns at most 3 — one editable target per card slot.

    Each target carries a `direction` field ("ABOVE"/"BELOW") so it maps
    directly onto the existing alert direction model. Prices are not rounded
    here; the HTTP layer rounds on output.
    """
    period = params["atr_period"]
    n = len(completed_bars)
    if n < period + 1:
        raise InsufficientHistoryError(
            f"need at least {period + 1} completed bars for ATR({period}); got {n}"
        )

    highs = [b["high"] for b in completed_bars]
    lows = [b["low"] for b in completed_bars]
    closes = [b["close"] for b in completed_bars]
    latest_atr = wilder_atr(highs, lows, closes, period)[-1]
    if latest_atr is None or latest_atr <= 0:
        raise InsufficientHistoryError("ATR could not be computed (non-positive or undefined)")

    ref = float(reference_price) if reference_price is not None else closes[-1]
    ref_source = "user_supplied" if reference_price is not None else "latest_completed_close"
    last_completed_index = n - 1

    zones = build_zones(completed_bars, latest_atr, last_completed_index, params)

    up, _ = select_targets(zones, "up", ref, latest_atr, params)
    down, _ = select_targets(zones, "down", ref, latest_atr, params)
    for t in up:
        t["direction"] = "ABOVE"
    for t in down:
        t["direction"] = "BELOW"

    merged = up + down
    merged.sort(key=lambda t: abs(t["alert_price"] - ref))

    min_spacing = params["min_spacing_atr"] * latest_atr
    selected = []
    for t in merged:
        if any(abs(t["alert_price"] - s["alert_price"]) < min_spacing for s in selected):
            continue
        selected.append(t)
        if len(selected) >= params["max_targets"]:
            break
    selected.sort(key=lambda t: t["alert_price"])
    for rank, t in enumerate(selected, start=1):
        t["rank"] = rank

    reason = None
    if len(selected) < params["max_targets"]:
        reason = (
            f"only {len(selected)} qualifying historical zone(s) found around the "
            f"reference price with >= {params['min_independent_visits']} independent "
            f"visits and >= {params['min_spacing_atr']}x ATR spacing; no synthetic "
            "extensions were added"
        )

    return {
        "atr": latest_atr,
        "reference_price": ref,
        "reference_price_source": ref_source,
        "last_completed_bar_date": completed_bars[-1]["date"],
        "bars_analyzed": n,
        "targets": selected,
        "reason": reason,
        "warnings": [],
        "algorithm_version": ALGORITHM_VERSION,
        "parameters": dict(params),
    }


def preview_targets(completed_bars, direction, reference_price=None, params=ALGO_PARAMS):
    """Full target preview over completed bars.

    Returns a dict with atr, reference_price, reference_price_source, targets,
    bars_analyzed, warnings, reason, algorithm_version, parameters.
    Raises InsufficientHistoryError when there are too few bars for ATR.
    """
    warnings: List[str] = []
    period = params["atr_period"]
    n = len(completed_bars)
    if n < period + 1:
        raise InsufficientHistoryError(
            f"need at least {period + 1} completed bars for ATR({period}); got {n}"
        )

    highs = [b["high"] for b in completed_bars]
    lows = [b["low"] for b in completed_bars]
    closes = [b["close"] for b in completed_bars]
    atr_series = wilder_atr(highs, lows, closes, period)
    latest_atr = atr_series[-1]
    if latest_atr is None or latest_atr <= 0:
        raise InsufficientHistoryError("ATR could not be computed (non-positive or undefined)")

    last_completed_index = n - 1

    if reference_price is not None:
        ref = float(reference_price)
        ref_source = "user_supplied"
    else:
        ref = closes[-1]
        ref_source = "latest_completed_close"

    min_bars_for_swing = 2 * params["swing_strength"] + 1
    if n < min_bars_for_swing:
        warnings.append(
            f"only {n} completed bars; need {min_bars_for_swing} for a strict "
            f"{params['swing_strength']}/{params['swing_strength']} swing"
        )

    zones = build_zones(completed_bars, latest_atr, last_completed_index, params)
    targets, reason = select_targets(zones, direction, ref, latest_atr, params)
    if not targets and reason is None:
        reason = "no qualifying historical zones found"

    return {
        "atr": latest_atr,
        "reference_price": ref,
        "reference_price_source": ref_source,
        "last_completed_bar_date": completed_bars[-1]["date"],
        "bars_analyzed": n,
        "targets": targets,
        "reason": reason,
        "warnings": warnings,
        "algorithm_version": ALGORITHM_VERSION,
        "parameters": dict(params),
    }
