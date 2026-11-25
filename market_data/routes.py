"""Flask blueprint exposing the backend-only market-data endpoints.

    GET /api/market-data/history           (Phase 1 — feed verification)
    GET /api/market-data/targets/preview   (Phase 2 — target preview, read-only)

The target-preview endpoint is strictly read-only: it never writes active
targets, never updates alert records, and never sends email.

Data source: UNOFFICIAL Yahoo Finance via `yfinance`. Development/integration
use only; not licensed for commercial redistribution.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from . import ADJUSTMENT_METHOD, INTERVAL, PROVIDER_NAME
from .cache import BarCache
from .errors import InvalidParameterError, MarketDataError
from .provider import YahooFinanceProvider
from .service import MarketDataService
from . import targets as targets_mod
from .multi_timeframe import suggest_multi_timeframe

market_data_bp = Blueprint("market_data", __name__, url_prefix="/api/market-data")

PRICE_DECIMALS = 2
ATR_DECIMALS = 4

# Shared singletons — created lazily so importing the blueprint is cheap and
# never opens a DB/socket at import time.
_service = None


def _get_service() -> MarketDataService:
    global _service
    if _service is None:
        db_path = os.environ.get("MARKET_DATA_DB", "market_data.db")
        _service = MarketDataService(YahooFinanceProvider(), BarCache(db_path))
    return _service


def set_service(service):
    """Test hook: inject a service built with a fake provider / temp cache."""
    global _service
    _service = service


# ---------------------------------------------------------------------------
# Parameter parsing
# ---------------------------------------------------------------------------
def _parse_bool(raw, default=False):
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _parse_int(raw, name, default, lo, hi):
    if raw is None or str(raw).strip() == "":
        return default
    try:
        val = int(str(raw).strip())
    except ValueError:
        raise InvalidParameterError(f"{name} must be an integer")
    if val < lo or val > hi:
        raise InvalidParameterError(f"{name} must be between {lo} and {hi}")
    return val


def _require_symbol():
    symbol = (request.args.get("symbol") or "").strip()
    if not symbol:
        raise InvalidParameterError("symbol is required")
    return symbol.upper()


def _round(v, decimals):
    return round(v, decimals) if isinstance(v, (int, float)) else v


def _error_response(err: MarketDataError):
    return jsonify({"error": err.to_dict()}), err.status


# ---------------------------------------------------------------------------
# Phase 1 — history
# ---------------------------------------------------------------------------
@market_data_bp.get("/history")
def history():
    try:
        symbol = _require_symbol()
        lookback_years = _parse_int(request.args.get("lookback_years"),
                                    "lookback_years", 2, 1, 5)
        limit = _parse_int(request.args.get("limit"), "limit", 10, 1, 1500)
        refresh = _parse_bool(request.args.get("refresh"), False)

        service = _get_service()
        result = service.get_history(symbol, lookback_years, refresh)
    except MarketDataError as e:
        return _error_response(e)

    all_bars = result.bars
    returned = all_bars[-limit:] if limit < len(all_bars) else all_bars
    bars_json = [
        {
            "date": b["date"],
            "open": _round(b["open"], PRICE_DECIMALS),
            "high": _round(b["high"], PRICE_DECIMALS),
            "low": _round(b["low"], PRICE_DECIMALS),
            "close": _round(b["close"], PRICE_DECIMALS),
            "volume": int(b["volume"]) if b["volume"] is not None else None,
        }
        for b in returned
    ]

    body = {
        "symbol": result.symbol,
        "provider": PROVIDER_NAME,
        "interval": INTERVAL,
        "adjustment_method": ADJUSTMENT_METHOD,
        "currency": result.currency,
        "exchange_timezone": result.exchange_timezone,
        "fetched_at": result.fetched_at,
        "cache_hit": result.cache_hit,
        "stale": result.stale,
        "requested_lookback_years": result.requested_lookback_years,
        "first_bar_date": result.first_bar_date,
        "last_bar_date": result.last_bar_date,
        "total_bars": len(all_bars),
        "returned_bars": len(bars_json),
        "latest_completed_close": _round(result.latest_completed_close, PRICE_DECIMALS),
        "data_source_note": "UNOFFICIAL Yahoo Finance (yfinance); not licensed for commercial redistribution",
        "warnings": result.warnings,
        "bars": bars_json,
    }
    return jsonify(body)


# ---------------------------------------------------------------------------
# Phase 2 — target preview (read-only; never persists or notifies)
# ---------------------------------------------------------------------------
@market_data_bp.get("/targets/preview")
def targets_preview():
    try:
        symbol = _require_symbol()
        direction = (request.args.get("direction") or "up").strip().lower()
        if direction not in ("up", "down"):
            raise InvalidParameterError("direction must be 'up' or 'down'")
        lookback_years = _parse_int(request.args.get("lookback_years"),
                                    "lookback_years", 2, 1, 5)
        refresh = _parse_bool(request.args.get("refresh"), False)

        ref_raw = request.args.get("reference_price")
        reference_price = None
        if ref_raw is not None and str(ref_raw).strip() != "":
            try:
                reference_price = float(ref_raw)
            except ValueError:
                raise InvalidParameterError("reference_price must be a number")
            if reference_price <= 0:
                raise InvalidParameterError("reference_price must be positive")

        service = _get_service()
        result = service.get_history(symbol, lookback_years, refresh)
        preview = targets_mod.preview_targets(
            result.completed_bars, direction, reference_price
        )
    except MarketDataError as e:
        return _error_response(e)

    targets_json = []
    for t in preview["targets"]:
        targets_json.append({
            "rank": t["rank"],
            "alert_price": _round(t["alert_price"], PRICE_DECIMALS),
            "zone_lower": _round(t["zone_lower"], PRICE_DECIMALS),
            "zone_upper": _round(t["zone_upper"], PRICE_DECIMALS),
            "median_price": _round(t["median_price"], PRICE_DECIMALS),
            "independent_visits": t["independent_visits"],
            "strength_score": _round(t["strength_score"], 4),
            "last_visit_date": t["last_visit_date"],
            "source": t["source"],
        })

    warnings = list(result.warnings) + list(preview["warnings"])

    body = {
        "symbol": result.symbol,
        "direction": direction,
        "provider": PROVIDER_NAME,
        "interval": INTERVAL,
        "timeframe": "daily",
        "adjustment_method": ADJUSTMENT_METHOD,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
        "last_completed_bar_date": preview["last_completed_bar_date"],
        "reference_price": _round(preview["reference_price"], PRICE_DECIMALS),
        "reference_price_source": preview["reference_price_source"],
        "reference_price_note": (
            "a supplied reference_price must use the same adjusted price basis "
            "as the bars (yfinance_auto_adjust); the completed daily close is "
            "NOT a live quote"
        ),
        "atr": _round(preview["atr"], ATR_DECIMALS),
        "algorithm_version": preview["algorithm_version"],
        "parameters": preview["parameters"],
        "bars_analyzed": preview["bars_analyzed"],
        "strength_note": "strength_score is a relative ranking score, not a probability or confidence",
        "data_source_note": "UNOFFICIAL Yahoo Finance (yfinance); not licensed for commercial redistribution",
        "targets": targets_json,
        "reason": preview["reason"],
        "warnings": warnings,
    }
    return jsonify(body)


# ---------------------------------------------------------------------------
# Suggestions — merged support+resistance, one per card slot (read-only)
# ---------------------------------------------------------------------------
MAX_BATCH_SYMBOLS = 250
SUGGEST_DEFAULT_LOOKBACK_YEARS = 5
SUGGEST_ALGORITHMS = {
    "mtf": suggest_multi_timeframe,
    "v1": targets_mod.suggest_targets,
}


def _parse_algorithm(raw):
    algo = (raw or "mtf").strip().lower()
    if algo not in SUGGEST_ALGORITHMS:
        raise InvalidParameterError("algorithm must be one of: mtf, v1")
    return algo


def _suggest_payload(service, symbol, lookback_years, refresh, algorithm="mtf"):
    """Compute a suggestion payload for one symbol. On any MarketDataError the
    error is captured and returned (so a batch never fails as a whole)."""
    try:
        result = service.get_history(symbol, lookback_years, refresh)
        s = SUGGEST_ALGORITHMS[algorithm](result.completed_bars)
    except MarketDataError as e:
        return {"symbol": symbol, "error": e.to_dict()}

    targets_json = [
        {
            "rank": t["rank"],
            "price": _round(t["alert_price"], PRICE_DECIMALS),
            "direction": t["direction"],
            "zone_lower": _round(t["zone_lower"], PRICE_DECIMALS),
            "zone_upper": _round(t["zone_upper"], PRICE_DECIMALS),
            "median_price": _round(t["median_price"], PRICE_DECIMALS),
            "independent_visits": t["independent_visits"],
            "strength_score": _round(t["strength_score"], 4),
            "last_visit_date": t["last_visit_date"],
            "source": t["source"],
            "timeframes": t.get("timeframes", ["1d"]),
        }
        for t in s["targets"]
    ]
    return {
        "symbol": result.symbol,
        "provider": PROVIDER_NAME,
        "interval": "1d" if algorithm == "v1" else "1d+1wk",
        "adjustment_method": ADJUSTMENT_METHOD,
        "calculated_at": datetime.now(timezone.utc).isoformat(),
        "last_completed_bar_date": s["last_completed_bar_date"],
        "reference_price": _round(s["reference_price"], PRICE_DECIMALS),
        "reference_price_source": s["reference_price_source"],
        "atr": _round(s["atr"], ATR_DECIMALS),
        "algorithm_version": s["algorithm_version"],
        "bars_analyzed": s["bars_analyzed"],
        "targets": targets_json,
        "reason": s["reason"],
        "warnings": list(result.warnings) + list(s.get("warnings", [])),
    }


@market_data_bp.get("/targets/suggest")
def targets_suggest():
    try:
        symbol = _require_symbol()
        lookback_years = _parse_int(request.args.get("lookback_years"),
                                    "lookback_years", SUGGEST_DEFAULT_LOOKBACK_YEARS, 1, 5)
        refresh = _parse_bool(request.args.get("refresh"), False)
        algorithm = _parse_algorithm(request.args.get("algorithm"))
    except MarketDataError as e:
        return _error_response(e)

    payload = _suggest_payload(_get_service(), symbol, lookback_years, refresh, algorithm)
    if "error" in payload:
        # Surface the real status for a single-symbol request.
        status = {"invalid_parameter": 400, "symbol_not_found": 404,
                  "no_history": 404, "insufficient_history": 422,
                  "provider_unavailable": 502, "provider_throttled": 503}.get(
                      payload["error"]["code"], 500)
        return jsonify({"error": payload["error"], "symbol": symbol}), status
    return jsonify(payload)


@market_data_bp.get("/targets/suggest-batch")
def targets_suggest_batch():
    """Compute suggestions for many symbols in one call.

    `symbols` = comma-separated list (e.g. ?symbols=AAPL,SPY,QQQ). Per-symbol
    failures are reported inside `results` rather than failing the batch, so a
    dashboard can render whatever succeeded. Cached symbols return instantly.
    """
    try:
        raw = request.args.get("symbols") or ""
        symbols = [s.strip().upper() for s in raw.split(",") if s.strip()]
        if not symbols:
            raise InvalidParameterError("symbols is required (comma-separated)")
        # de-dupe, preserve order
        seen, unique = set(), []
        for s in symbols:
            if s not in seen:
                seen.add(s)
                unique.append(s)
        if len(unique) > MAX_BATCH_SYMBOLS:
            raise InvalidParameterError(f"too many symbols (max {MAX_BATCH_SYMBOLS})")
        lookback_years = _parse_int(request.args.get("lookback_years"),
                                    "lookback_years", SUGGEST_DEFAULT_LOOKBACK_YEARS, 1, 5)
        refresh = _parse_bool(request.args.get("refresh"), False)
        algorithm = _parse_algorithm(request.args.get("algorithm"))
    except MarketDataError as e:
        return _error_response(e)

    service = _get_service()
    results = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_suggest_payload, service, sym, lookback_years, refresh, algorithm): sym
            for sym in unique
        }
        for fut in futures:
            sym = futures[fut]
            try:
                results[sym] = fut.result()
            except Exception as e:  # noqa: BLE001 - defensive, keep batch alive
                results[sym] = {"symbol": sym, "error": {
                    "code": "market_data_error", "message": str(e), "retryable": False}}

    ok = sum(1 for v in results.values() if "error" not in v)
    return jsonify({"count": len(unique), "succeeded": ok, "results": results})
