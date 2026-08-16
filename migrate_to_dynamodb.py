"""
One-off migration: import existing watchlist.xlsx into DynamoDB for a user.

Usage:
  DYNAMODB_TABLE=trade-alerts-data \
  MIGRATE_USER_ID=... \
  MIGRATE_EMAIL=... \
  MIGRATE_NAME=... \
  python migrate_to_dynamodb.py

Defaults to the demo account if no envs are set.
"""

import os
import db
from excel_manager import read_watchlist


def migrate(user_id: str, email: str, name: str, watchlist_path: str = "watchlist.xlsx"):
    if not os.environ.get("DYNAMODB_TABLE"):
        raise RuntimeError("DYNAMODB_TABLE not set")

    db.ensure_profile(user_id, email, name)

    try:
        items = read_watchlist(watchlist_path)
    except FileNotFoundError:
        print(f"❌ {watchlist_path} not found; nothing to migrate.")
        return

    if not items:
        print("⚠️  Watchlist is empty.")
        return

    sectors = {}
    for item in items:
        sectors.setdefault(item.get("sector", "Default"), []).append(item)

    for sector, stocks in sectors.items():
        db.add_sector(user_id, sector)
        for s in stocks:
            ticker = s.get("ticker")
            targets = s.get("targets", [])
            if not ticker:
                continue
            db.add_stock(user_id, sector, ticker)
            if targets:
                db.set_targets(user_id, sector, ticker, targets)

    print(f"✅ Migrated {len(items)} stocks in {len(sectors)} sectors for {email}")


if __name__ == "__main__":
    user_id = os.environ.get("MIGRATE_USER_ID", "demo-1")
    email = os.environ.get("MIGRATE_EMAIL", "user@tradealerts.io")
    name = os.environ.get("MIGRATE_NAME", "Migrated User")
    migrate(user_id, email, name)
