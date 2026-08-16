"""
Multi-user API v2 — backed by DynamoDB and gated by Cognito JWT.
Mounted at /api/v2 from app.py when DYNAMODB_TABLE is set.
"""

import os
from flask import Blueprint, request, g, jsonify

import db
from auth import require_auth
from price_fetcher import fetch_prices, fetch_earnings_dates

api_v2 = Blueprint("api_v2", __name__)


def _json_ok(**extra):
    return jsonify({"ok": True, **extra})


def _req_json():
    return request.get_json(force=True) or {}


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
@require_auth
def api_get_watchlist():
    return jsonify(db.get_watchlist(g.user_id))


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
@require_auth
def api_refresh_prices():
    stocks = db.list_stocks(g.user_id)
    tickers = [s["ticker"] for s in stocks if s.get("ticker")]
    if not tickers:
        return jsonify(db.get_watchlist(g.user_id))

    prices = fetch_prices(tickers)
    earnings = fetch_earnings_dates(tickers)

    for s in stocks:
        t = s.get("ticker")
        p = prices.get(t)
        e = earnings.get(t)
        if p is not None:
            db.update_prices_for_ticker(t, p, e)
    return jsonify(db.get_watchlist(g.user_id))


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
