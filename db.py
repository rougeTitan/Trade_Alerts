"""
DynamoDB data repository for multi-user Trade Alerts.
Single-table design: PK = USER#<sub>, SK varies by entity.
"""

import os
import time
from decimal import Decimal
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "")

if not TABLE_NAME:
    # Defer construction until required; allows importing without a table set.
    _table = None
else:
    import boto3
    _dynamodb = boto3.resource("dynamodb")
    _table = _dynamodb.Table(TABLE_NAME)


def _get_table():
    if _table is None:
        raise RuntimeError("DYNAMODB_TABLE not configured")
    return _table


def _now():
    return datetime.now(timezone.utc).isoformat()


def _clean_targets(targets):
    """Normalize target list, preserving slot order incl. None."""
    clean = []
    for t in targets[:3]:
        if not t:
            clean.append(None)
            continue
        try:
            price = float(t["price"])
            d = str(t.get("direction", "BOTH")).upper()
            if d not in ("ABOVE", "BELOW", "BOTH"):
                d = "BOTH"
            clean.append({"price": price, "direction": d})
        except (TypeError, ValueError, KeyError):
            clean.append(None)
    return clean


# -----------------------------------------------------------------------------
# Profile
# -----------------------------------------------------------------------------
def ensure_profile(user_id, email, name=None):
    table = _get_table()
    table.put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": "PROFILE",
            "email": email,
            "name": name or email.split("@")[0],
            "notifyEmail": email,
            "createdAt": _now(),
        }
    )


def get_profile(user_id):
    table = _get_table()
    r = table.get_item(Key={"PK": f"USER#{user_id}", "SK": "PROFILE"})
    return r.get("Item")


def update_profile(user_id, attrs):
    table = _get_table()
    expr = []
    names = {}
    values = {}
    for i, (k, v) in enumerate(attrs.items()):
        if k in ("PK", "SK"):
            continue
        token = f"#a{i}"
        vtoken = f":v{i}"
        expr.append(f"{token} = {vtoken}")
        names[token] = k
        values[vtoken] = v
    if not expr:
        return
    table.update_item(
        Key={"PK": f"USER#{user_id}", "SK": "PROFILE"},
        UpdateExpression="SET " + ", ".join(expr),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


# -----------------------------------------------------------------------------
# Sectors
# -----------------------------------------------------------------------------
def add_sector(user_id, name):
    table = _get_table()
    table.put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": f"SECTOR#{name}",
            "name": name,
            "createdAt": _now(),
        }
    )


def delete_sector(user_id, name):
    table = _get_table()
    # Cascade: first remove all stocks in this sector.
    table.delete_item(Key={"PK": f"USER#{user_id}", "SK": f"SECTOR#{name}"})
    stocks = list_stocks(user_id, name)
    with table.batch_writer() as batch:
        for s in stocks:
            batch.delete_item(
                Key={
                    "PK": f"USER#{user_id}",
                    "SK": f"STOCK#{name}#{s['ticker']}",
                }
            )
            # Best-effort decr ticker refcount; ignore if missing.
            _decr_ticker(s["ticker"])


def list_sectors(user_id):
    table = _get_table()
    r = table.query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("SECTOR#")
    )
    return [i["name"] for i in r.get("Items", [])]


# -----------------------------------------------------------------------------
# Stocks
# -----------------------------------------------------------------------------
def add_stock(user_id, sector, ticker):
    table = _get_table()
    ticker = ticker.upper()
    table.put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": f"STOCK#{sector}#{ticker}",
            "ticker": ticker,
            "sector": sector,
            "targets": [None, None, None],
            "earningsDate": None,
            "GSI1PK": f"TICKER#{ticker}",
            "GSI1SK": f"USER#{user_id}#{sector}",
            "updatedAt": _now(),
        }
    )
    _incr_ticker(ticker)


def remove_stock(user_id, sector, ticker):
    table = _get_table()
    ticker = ticker.upper()
    table.delete_item(
        Key={"PK": f"USER#{user_id}", "SK": f"STOCK#{sector}#{ticker}"}
    )
    _decr_ticker(ticker)


def set_targets(user_id, sector, ticker, targets):
    table = _get_table()
    clean = _clean_targets(targets)
    table.update_item(
        Key={"PK": f"USER#{user_id}", "SK": f"STOCK#{sector}#{ticker.upper()}"},
        UpdateExpression="SET targets = :t, updatedAt = :u",
        ExpressionAttributeValues={":t": clean, ":u": _now()},
    )


def list_stocks(user_id, sector=None):
    table = _get_table()
    if sector:
        r = table.query(
            KeyConditionExpression=Key("PK").eq(f"USER#{user_id}")
            & Key("SK").begins_with(f"STOCK#{sector}#")
        )
    else:
        r = table.query(
            KeyConditionExpression=Key("PK").eq(f"USER#{user_id}")
            & Key("SK").begins_with("STOCK#")
        )
    return r.get("Items", [])


def get_stock(user_id, sector, ticker):
    table = _get_table()
    r = table.get_item(
        Key={"PK": f"USER#{user_id}", "SK": f"STOCK#{sector}#{ticker.upper()}"}
    )
    return r.get("Item")


def update_prices_for_ticker(ticker, price, earnings_date=None):
    """Set current price on every user's stock watching `ticker` (dedup)."""
    table = _get_table()
    watchers = list_watchers_for_ticker(ticker)
    for w in watchers:
        table.update_item(
            Key={"PK": w["PK"], "SK": w["SK"]},
            UpdateExpression="SET currentPrice = :p, updatedAt = :u",
            ExpressionAttributeValues={
                ":p": Decimal(str(price)) if price is not None else None,
                ":u": _now(),
            },
        )


def set_stock_price(user_id, sector, ticker, price, earnings_date=None):
    table = _get_table()
    expr = "SET currentPrice = :p"
    vals = {":p": Decimal(str(price)) if price is not None else None}
    if earnings_date:
        expr += ", earningsDate = :e"
        vals[":e"] = earnings_date
    table.update_item(
        Key={"PK": f"USER#{user_id}", "SK": f"STOCK#{sector}#{ticker.upper()}"},
        UpdateExpression=expr,
        ExpressionAttributeValues=vals,
    )


# -----------------------------------------------------------------------------
# Watchlist (grouped by sector, mirrors old /api/watchlist shape)
# -----------------------------------------------------------------------------
def get_watchlist(user_id):
    """Return {sector: [stock, ...]} for dashboard."""
    items = _get_table().query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}"),
    )["Items"]
    sectors = {}
    for i in items:
        if i["SK"].startswith("STOCK#"):
            sectors.setdefault(i.get("sector"), []).append({
                "ticker": i.get("ticker"),
                "current_price": float(i.get("currentPrice", 0) or 0),
                "targets": i.get("targets", [None, None, None]),
                "earnings_date": i.get("earningsDate"),
            })
    # Return ordered empty list for every known sector for dashboard.
    sector_names = [i["name"] for i in items if i["SK"].startswith("SECTOR#")]
    out = {s: sectors.get(s, []) for s in sector_names}
    return out


# -----------------------------------------------------------------------------
# Ticker reference counting (monitor dedupes price fetches)
# -----------------------------------------------------------------------------
def _incr_ticker(ticker):
    _get_table().update_item(
        Key={"PK": "GLOBAL", "SK": f"TICKER#{ticker.upper()}"},
        UpdateExpression="ADD count :i",
        ExpressionAttributeValues={":i": 1},
    )


def _decr_ticker(ticker):
    _get_table().update_item(
        Key={"PK": "GLOBAL", "SK": f"TICKER#{ticker.upper()}"},
        UpdateExpression="ADD count :i",
        ExpressionAttributeValues={":i": -1},
    )


def list_all_tickers():
    r = _get_table().query(
        KeyConditionExpression=Key("PK").eq("GLOBAL") & Key("SK").begins_with("TICKER#"),
    )
    return [i["SK"].replace("TICKER#", "") for i in r.get("Items", []) if (i.get("count") or 0) > 0]


def list_watchers_for_ticker(ticker):
    r = _get_table().query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"TICKER#{ticker.upper()}") & Key("GSI1SK").begins_with("USER#"),
    )
    return r.get("Items", [])


# -----------------------------------------------------------------------------
# Alerts
# -----------------------------------------------------------------------------
def add_alert(user_id, alert):
    table = _get_table()
    ts = alert.get("timestamp") or _now()
    sk = f"ALERT#{ts}#{alert['ticker']}#{alert.get('direction', 'UNKNOWN')}"
    table.put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": sk,
            "timestamp": ts,
            "ticker": alert["ticker"],
            "current_price": Decimal(str(alert.get("current_price", 0))) if alert.get("current_price") is not None else None,
            "target_price": Decimal(str(alert.get("target_price", 0))) if alert.get("target_price") is not None else None,
            "direction": alert.get("direction"),
            "status": "TRIGGERED",
            "ttl": int(time.time()) + 30 * 86400,
        }
    )


def list_alerts(user_id):
    r = _get_table().query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("ALERT#"),
    )
    return r.get("Items", [])


def clear_alerts(user_id):
    table = _get_table()
    alerts = list_alerts(user_id)
    with table.batch_writer() as batch:
        for a in alerts:
            batch.delete_item(Key={"PK": a["PK"], "SK": a["SK"]})


def dismiss_alert(user_id, ticker, direction):
    table = _get_table()
    to_remove = []
    r = table.query(
        KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("ALERT#"),
    )
    for a in r.get("Items", []):
        if a.get("ticker") == ticker and a.get("direction", "").upper() == direction.upper():
            to_remove.append(a)
    with table.batch_writer() as batch:
        for a in to_remove:
            batch.delete_item(Key={"PK": a["PK"], "SK": a["SK"]})


# -----------------------------------------------------------------------------
# Fired dedup (per-user, per-day)
# -----------------------------------------------------------------------------
def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def is_fired(user_id, ticker, price, direction):
    r = _get_table().get_item(
        Key={
            "PK": f"USER#{user_id}",
            "SK": f"FIRED#{_today()}#{ticker.upper()}#{price}#{direction.upper()}",
        }
    )
    return "Item" in r


def mark_fired(user_id, ticker, price, direction):
    from time import time as _time
    _get_table().put_item(
        Item={
            "PK": f"USER#{user_id}",
            "SK": f"FIRED#{_today()}#{ticker.upper()}#{price}#{direction.upper()}",
            "ttl": int(_time()) + 2 * 86400,
        }
    )
