"""Multi-timeframe (daily + weekly) support/resistance suggestions (algorithm v2).

Pure functions over *completed* daily bars. Weekly bars are derived by
resampling the same daily bars, so no extra provider calls or cache schema
changes are needed. Reuses the v1 building blocks (ATR, strict swings,
bounded-span clustering, independent visits) in `targets.py`.

Pipeline:
  daily bars  -> zones (daily ATR / daily params)
  weekly bars -> zones (weekly ATR / weekly params)
  merge zones that overlap (or sit within 0.5 x daily ATR) -> confluence zones
  strength = daily + WEEKLY_WEIGHT * weekly, x CONFLUENCE_BONUS when both agree
  select 3 around the reference price: best support + best resistance first,
  third slot filled by the next strongest, all with >= 1 x daily ATR spacing.

Strength is a relative ranking score, NOT a probability or confidence.
"""

from datetime import date as _date
from typing import List, Optional

from .errors import InsufficientHistoryError
from . import targets as t1

MTF_ALGORITHM_VERSION = "v2-mtf"

DAILY_PARAMS = dict(t1.ALGO_PARAMS, decay_halflife_bars=252)
WEEKLY_PARAMS = dict(
    t1.ALGO_PARAMS,
    swing_strength=3,
    visit_separation_bars=2,
    decay_halflife_bars=52,
)

MTF_PARAMS = {
    "daily": DAILY_PARAMS,
    "weekly": WEEKLY_PARAMS,
    "weekly_weight": 1.5,
    "confluence_bonus": 1.25,
    "merge_tolerance_daily_atr": 0.5,
    "proximity_scale_atr": 8.0,   # distance (in daily ATR) at which strength is halved
    "min_spacing_daily_atr": 1.0,
    "max_targets": 3,
}


# ---------------------------------------------------------------------------
# Weekly resampling
# ---------------------------------------------------------------------------
def resample_weekly(daily_bars) -> List[dict]:
    """Group completed daily bars into ISO weeks.

    The trailing week is dropped unless its last bar is a Friday, so a partial
    week never leaks into the weekly series (no look-ahead). A holiday-shortened
    final week is therefore treated as incomplete until the next week starts.
    """
    weeks = []
    cur_key = None
    cur = []
    for b in daily_bars:
        d = _date.fromisoformat(b["date"])
        iso = d.isocalendar()
        key = (iso[0], iso[1])
        if key != cur_key:
            if cur:
                weeks.append(cur)
            cur = []
            cur_key = key
        cur.append(b)
    if cur:
        weeks.append(cur)

    if weeks:
        last_day = _date.fromisoformat(weeks[-1][-1]["date"])
        if last_day.weekday() != 4:
            weeks.pop()

    out = []
    for w in weeks:
        vols = [x.get("volume") for x in w if x.get("volume") is not None]
        out.append({
            "date": w[-1]["date"],
            "open": w[0]["open"],
            "high": max(x["high"] for x in w),
            "low": min(x["low"] for x in w),
            "close": w[-1]["close"],
            "volume": sum(vols) if vols else None,
        })
    return out


# ---------------------------------------------------------------------------
# Zone merging
# ---------------------------------------------------------------------------
def _gap(a, b) -> float:
    """Distance between two [lower, upper] intervals (0 when they overlap)."""
    if a["zone_upper"] < b["zone_lower"]:
        return b["zone_lower"] - a["zone_upper"]
    if b["zone_upper"] < a["zone_lower"]:
        return a["zone_lower"] - b["zone_upper"]
    return 0.0


def merge_zones(daily_zones, weekly_zones, tolerance: float, params=MTF_PARAMS):
    """Combine daily and weekly zones into confluence zones.

    Each weekly zone absorbs every still-unused daily zone within `tolerance`.
    Leftover daily zones and weekly zones with no daily partner stand alone.
    """
    w_weight = params["weekly_weight"]
    bonus = params["confluence_bonus"]
    used = set()
    merged = []

    for wz in weekly_zones:
        partners = [
            (i, dz) for i, dz in enumerate(daily_zones)
            if i not in used and _gap(wz, dz) <= tolerance
        ]
        members = [wz] + [dz for _, dz in partners]
        for i, _ in partners:
            used.add(i)
        daily_strength = sum(dz["strength_score"] for _, dz in partners)
        strength = daily_strength + w_weight * wz["strength_score"]
        timeframes = ["1wk"]
        visits = wz["independent_visits"]
        if partners:
            timeframes = ["1d", "1wk"]
            strength *= bonus
            visits += sum(dz["independent_visits"] for _, dz in partners)
        merged.append(_combine(members, strength, visits, timeframes))

    for i, dz in enumerate(daily_zones):
        if i in used:
            continue
        merged.append(_combine([dz], dz["strength_score"], dz["independent_visits"], ["1d"]))
    return merged


def _combine(members, strength, visits, timeframes):
    lower = min(m["zone_lower"] for m in members)
    upper = max(m["zone_upper"] for m in members)
    weights = [m["strength_score"] for m in members]
    total_w = sum(weights) or 1.0
    median_price = sum(m["median_price"] * w for m, w in zip(members, weights)) / total_w
    return {
        "zone_lower": lower,
        "zone_upper": upper,
        "median_price": median_price,
        "independent_visits": visits,
        "strength_score": strength,
        "last_visit_date": max(m["last_visit_date"] for m in members),
        "timeframes": timeframes,
        "source": "multi_timeframe_zone",
    }


# ---------------------------------------------------------------------------
# Selection around the reference price
# ---------------------------------------------------------------------------
def _rank_score(zone, ref, atr, params) -> float:
    if zone["zone_lower"] > ref:
        dist = zone["zone_lower"] - ref
    else:
        dist = ref - zone["zone_upper"]
    scale = params["proximity_scale_atr"] * atr
    return zone["strength_score"] / (1.0 + dist / scale)


def select_around(zones, ref, atr, params=MTF_PARAMS):
    """Pick up to `max_targets` zones around `ref`.

    Zones that straddle the reference price are skipped (neither side).
    Order: strongest resistance, strongest support, then best remaining. Each
    pick must be >= min_spacing from every earlier pick.
    """
    candidates = []
    for z in zones:
        if z["zone_lower"] > ref:
            c = dict(z, direction="ABOVE", alert_price=z["zone_lower"])
        elif z["zone_upper"] < ref:
            c = dict(z, direction="BELOW", alert_price=z["zone_upper"])
        else:
            continue
        c["rank_score"] = _rank_score(c, ref, atr, params)
        candidates.append(c)
    candidates.sort(key=lambda c: c["rank_score"], reverse=True)

    min_spacing = params["min_spacing_daily_atr"] * atr
    selected = []

    def _try(c):
        if any(abs(c["alert_price"] - s["alert_price"]) < min_spacing for s in selected):
            return False
        selected.append(c)
        return True

    for side in ("ABOVE", "BELOW"):
        for c in candidates:
            if c["direction"] == side and _try(c):
                break
    for c in candidates:
        if len(selected) >= params["max_targets"]:
            break
        if c not in selected:
            _try(c)

    selected = selected[: params["max_targets"]]
    selected.sort(key=lambda c: c["alert_price"])
    for rank, c in enumerate(selected, start=1):
        c["rank"] = rank
    return selected


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def suggest_multi_timeframe(completed_bars, reference_price: Optional[float] = None,
                            params=MTF_PARAMS):
    """Suggest up to 3 strong zones around the reference price (daily + weekly).

    Same output shape as `targets.suggest_targets`, with `timeframes` added to
    every target. Raises InsufficientHistoryError when daily ATR cannot be
    computed. Weekly analysis is skipped (with a warning) when there is too
    little weekly history.
    """
    dp = params["daily"]
    wp = params["weekly"]
    n = len(completed_bars)
    if n < dp["atr_period"] + 1:
        raise InsufficientHistoryError(
            f"need at least {dp['atr_period'] + 1} completed bars for ATR({dp['atr_period']}); got {n}"
        )

    highs = [b["high"] for b in completed_bars]
    lows = [b["low"] for b in completed_bars]
    closes = [b["close"] for b in completed_bars]
    daily_atr = t1.wilder_atr(highs, lows, closes, dp["atr_period"])[-1]
    if daily_atr is None or daily_atr <= 0:
        raise InsufficientHistoryError("ATR could not be computed (non-positive or undefined)")

    ref = float(reference_price) if reference_price is not None else closes[-1]
    ref_source = "user_supplied" if reference_price is not None else "latest_completed_close"

    daily_zones = t1.build_zones(completed_bars, daily_atr, n - 1, dp)

    warnings: List[str] = []
    weekly_zones = []
    weekly = resample_weekly(completed_bars)
    wn = len(weekly)
    if wn >= wp["atr_period"] + 1 and wn >= 2 * wp["swing_strength"] + 1:
        w_atr = t1.wilder_atr(
            [b["high"] for b in weekly], [b["low"] for b in weekly],
            [b["close"] for b in weekly], wp["atr_period"],
        )[-1]
        if w_atr and w_atr > 0:
            weekly_zones = t1.build_zones(weekly, w_atr, wn - 1, wp)
    else:
        warnings.append(
            f"only {wn} completed weekly bars; weekly analysis skipped (daily zones only)"
        )

    tolerance = params["merge_tolerance_daily_atr"] * daily_atr
    zones = merge_zones(daily_zones, weekly_zones, tolerance, params)
    selected = select_around(zones, ref, daily_atr, params)

    reason = None
    if len(selected) < params["max_targets"]:
        reason = (
            f"only {len(selected)} qualifying zone(s) found around the reference "
            f"price (>= {dp['min_independent_visits']} independent visits, "
            f">= {params['min_spacing_daily_atr']}x daily ATR spacing); no synthetic "
            "extensions were added"
        )

    return {
        "atr": daily_atr,
        "reference_price": ref,
        "reference_price_source": ref_source,
        "last_completed_bar_date": completed_bars[-1]["date"],
        "bars_analyzed": n,
        "weekly_bars_analyzed": wn,
        "targets": selected,
        "reason": reason,
        "warnings": warnings,
        "algorithm_version": MTF_ALGORITHM_VERSION,
        "parameters": {k: v for k, v in params.items()},
    }
