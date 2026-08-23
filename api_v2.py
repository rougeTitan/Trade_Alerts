"""
Multi-user API v2 — backed by DynamoDB and gated by Cognito JWT.
Mounted at /api/v2 from app.py when DYNAMODB_TABLE is set.
"""

import os
from flask import Blueprint, request, g, jsonify

import db
from auth import require_auth, get_user_from_token
from price_fetcher import fetch_prices, fetch_earnings_dates

api_v2 = Blueprint("api_v2", __name__)


def _json_ok(**extra):
    return jsonify({"ok": True, **extra})


def _req_json():
    return request.get_json(force=True) or {}


# Demo watchlist shown to unauthenticated guests before they sign up.
# These are not written to DynamoDB; they live only in the response.
DEFAULT_SECTORS = ["Technology", "Healthcare", "Energy"]
DEFAULT_STOCKS = [
    ("Technology", "AAPL", [{"price": 220.0, "direction": "ABOVE"}, None, None]),
    ("Technology", "MSFT", [{"price": 450.0, "direction": "ABOVE"}, None, None]),
    ("Healthcare", "JNJ", [{"price": 170.0, "direction": "BELOW"}, None, None]),
    ("Energy", "XOM", [{"price": 115.0, "direction": "ABOVE"}, None, None]),
]


def _bearer_token():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return ""


def _token_user():
    auth = request.headers.get("Authorization", "")
    if not auth:
        return None
    if not auth.startswith("Bearer "):
        raise RuntimeError("bad authorization header")
    token = auth[7:].strip()
    if not token:
        raise RuntimeError("missing token")
    user = get_user_from_token(token)
    if not user:
        raise RuntimeError("invalid token")
    return user


def _build_default_watchlist(prices=None, earnings=None):
    out = {}
    for sector, ticker, targets in DEFAULT_STOCKS:
        out.setdefault(sector, [])
        p = prices.get(ticker) if prices else None
        out[sector].append({
            "ticker": ticker,
            "current_price": float(p) if p is not None else 0.0,
            "targets": targets,
            "earnings_date": earnings.get(ticker) if earnings else None,
        })
    return out


def _default_tickers():
    return [ticker for (_, ticker, _) in DEFAULT_STOCKS]


def _targets_to_floats(targets):
    # Client sends floats as JSON; JSON already is float, but clean for DynamoDB.
    return targets


@api_v2.get("/profile")
@require_auth
def api_profile():
    p = db.get_profile(g.user_id)
    return jsonify({
        "id": g.user_id,
        "email": p.get("email") if p else g.user.get("email"),
        "name": p.get("name") if p else g.user.get("name"),
    })


@api_v2.get("/watchlist")
def api_get_watchlist():
    try:
        user = _token_user()
    except Exception as e:
        return jsonify({"error": str(e)}), 401
    if user:
        return jsonify(db.get_watchlist(user["user_id"]))
    return jsonify(_build_default_watchlist())


@api_v2.post("/sectors")
@require_auth
def api_add_sector():
    data = _req_json()
    name = data.get("sector", "").strip()
    if not name:
        return jsonify({"error": "sector name required"}), 400
    if name in db.list_sectors(g.user_id):
        return jsonify({"error": "sector already exists"}), 409
    db.add_sector(g.user_id, name)
    return _json_ok()


@api_v2.delete("/sectors/<sector_name>")
@require_auth
def api_delete_sector(sector_name):
    db.delete_sector(g.user_id, sector_name)
    return _json_ok()


@api_v2.post("/stocks")
@require_auth
def api_add_stock():
    data = _req_json()
    sector = data.get("sector", "").strip()
    ticker = data.get("ticker", "").strip().upper()
    if not sector or not ticker:
        return jsonify({"error": "sector and ticker required"}), 400
    if sector not in db.list_sectors(g.user_id):
        return jsonify({"error": "sector does not exist"}), 400
    if db.get_stock(g.user_id, sector, ticker):
        return jsonify({"error": "ticker already exists in sector"}), 409
    db.add_stock(g.user_id, sector, ticker)
    return _json_ok()


@api_v2.delete("/stocks/<sector>/<ticker>")
@require_auth
def api_remove_stock(sector, ticker):
    db.remove_stock(g.user_id, sector, ticker)
    return _json_ok()


@api_v2.post("/targets")
@require_auth
def api_set_targets():
    data = _req_json()
    ticker = data.get("ticker", "").strip().upper()
    sector = data.get("sector", "").strip()
    targets = data.get("targets", [])
    if not ticker or not sector:
        return jsonify({"error": "ticker and sector required"}), 400
    if not db.get_stock(g.user_id, sector, ticker):
        return jsonify({"error": "stock not found"}), 404
    db.set_targets(g.user_id, sector, ticker, targets)
    return _json_ok()


@api_v2.get("/prices/refresh")
def api_refresh_prices():
    try:
        user = _token_user()
    except Exception as e:
        return jsonify({"error": str(e)}), 401
    if user:
        stocks = db.list_stocks(user["user_id"])
        tickers = [s["ticker"] for s in stocks if s.get("ticker")]
        if not tickers:
            return jsonify(db.get_watchlist(user["user_id"]))

        prices = fetch_prices(tickers)
        earnings = fetch_earnings_dates(tickers)

        for s in stocks:
            t = s.get("ticker")
            p = prices.get(t)
            e = earnings.get(t)
            if p is not None:
                db.update_prices_for_ticker(t, p, e)
        return jsonify(db.get_watchlist(user["user_id"]))

    # Guest demo mode: fetch live prices for the default tickers.
    tickers = _default_tickers()
    prices = fetch_prices(tickers)
    earnings = fetch_earnings_dates(tickers)
    return jsonify(_build_default_watchlist(prices, earnings))


@api_v2.get("/alerts")
@require_auth
def api_get_alerts():
    alerts = db.list_alerts(g.user_id)
    # Rehydrate Decimal to float for JSON.
    for a in alerts:
        for k in ("current_price", "target_price"):
            if a.get(k) is not None:
                a[k] = float(a[k])
    return jsonify(alerts)


@api_v2.delete("/alerts")
@require_auth
def api_clear_alerts():
    db.clear_alerts(g.user_id)
    return _json_ok(cleared=True)


@api_v2.delete("/alerts/<ticker>/<direction>")
@require_auth
def api_dismiss_alert(ticker, direction):
    db.dismiss_alert(g.user_id, ticker, direction)
    return _json_ok()


@api_v2.post("/check-once")
@require_auth
def api_check_once():
    # Per-user price check. Monitor logic is being rewritten; stub for now.
    return _json_ok(count=0)
