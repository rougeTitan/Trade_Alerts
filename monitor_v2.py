"""
Multi-user price monitor — DynamoDB-backed.
Fetches each unique ticker once, then fans out to all watchers and writes
per-user alerts to DynamoDB.
"""

import os
import json
from datetime import datetime

import pytz
from decimal import Decimal

import db
from price_fetcher import fetch_prices, fetch_earnings_dates


def _now(tz):
    return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S %Z")


def _check_target(price, prev_price, target_price, direction):
    """Return (triggered, breach_type)."""
    if price is None:
        return False, ""

    if direction == "ABOVE":
        if price >= target_price:
            return True, "CROSSED ABOVE"

    elif direction == "BELOW":
        if price <= target_price:
            return True, "CROSSED BELOW"

    elif direction == "BOTH":
        if prev_price is not None:
            if prev_price < target_price <= price:
                return True, "CROSSED ABOVE"
            if prev_price > target_price >= price:
                return True, "CROSSED BELOW"
        else:
            pct_diff = abs(price - target_price) / target_price * 100
            if pct_diff <= 0.5:
                return True, "AT TARGET"

    return False, ""


def check_prices(event=None, context=None):
    """Run one multi-user price check. Returns {user_id: [alert, ...]}."""
    timezone = os.environ.get("TIMEZONE", "America/New_York")
    tz = pytz.timezone(timezone)

    tickers = db.list_all_tickers()
    if not tickers:
        print("⚠️  No tickers being watched.")
        return {}

    # Fetch each ticker once (dedup across users).
    print(f"📊 Fetching fresh prices for {len(tickers)} tickers...")
    prices = fetch_prices(tickers)
    earnings = fetch_earnings_dates(tickers)
    if not prices:
        print("❌ Failed to fetch any prices.")
        return {}

    per_user_alerts = {}
    timestamp = _now(tz)

    for ticker in tickers:
        price = prices.get(ticker)
        if price is None:
            continue

        watchers = db.list_watchers_for_ticker(ticker)
        if not watchers:
            continue

        for w in watchers:
            user_id = w["PK"].replace("USER#", "")
            sector = w.get("sector")
            targets = w.get("targets", [])

            # Previous price is what is currently stored before we overwrite it.
            prev_price = w.get("currentPrice")
            if prev_price is not None:
                prev_price = float(prev_price)

            for t in targets:
                if not t:
                    continue
                target_price = float(t["price"])
                direction = t.get("direction", "BOTH").upper()

                if db.is_fired(user_id, ticker, target_price, direction):
                    continue

                triggered, breach = _check_target(price, prev_price, target_price, direction)
                if not triggered:
                    continue

                alert = {
                    "timestamp": timestamp,
                    "sector": sector,
                    "ticker": ticker,
                    "current_price": price,
                    "target_price": target_price,
                    "target_direction": direction,
                    "direction": breach,
                    "status": "TRIGGERED",
                }

                db.add_alert(user_id, alert)
                db.mark_fired(user_id, ticker, target_price, direction)
                per_user_alerts.setdefault(user_id, []).append(alert)
                print(f"🚨 ALERT: {ticker} ({sector}) user={user_id} ${price} {breach} target ${target_price}")

        # Update every watcher with the new price.
        db.update_prices_for_ticker(ticker, price, earnings.get(ticker))

    print(f"✅ {timestamp} - {len(tickers)} tickers checked. {sum(len(v) for v in per_user_alerts.values())} alerts.")
    return per_user_alerts
