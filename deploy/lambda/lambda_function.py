"""
AWS Lambda handler for Trade Alerts (serverless scheduled checks).

Triggered by EventBridge Scheduler at 12:00 and 15:00 America/New_York.
Flow:
  1. Load email credentials from Secrets Manager.
  2. Download watchlist.xlsx (+ optional alert_log.csv for dedup) from S3 to /tmp.
  3. Build a config.json in /tmp and run one price check.
  4. Email any triggered alerts (reuses notifier.Notifier).
  5. Upload the updated watchlist.xlsx and alert_log.csv back to S3.

Environment variables (set by Terraform):
  STATE_BUCKET        S3 bucket holding watchlist.xlsx / sectors.json / alert_log.csv
  SECRET_ARN          Secrets Manager ARN whose value is the "email" config JSON
  TIMEZONE            IANA tz for alert timestamps (default America/New_York)
  WATCHLIST_KEY       S3 key for the Excel watchlist (default watchlist.xlsx)
  ALERT_LOG_KEY       S3 key for the alert log CSV (default alert_log.csv)

Event payload:
  {"reset_daily": true}   -> ignore prior alert log so the day starts fresh (noon run)
  {"reset_daily": false}  -> keep dedup state (3pm run)
"""

import os
import json

import boto3
from botocore.exceptions import ClientError

TMP = "/tmp"
CONFIG_PATH = os.path.join(TMP, "config.json")

s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")


def _load_email_config() -> dict:
    """Fetch the email credential block from Secrets Manager."""
    arn = os.environ["SECRET_ARN"]
    resp = secrets.get_secret_value(SecretId=arn)
    data = json.loads(resp["SecretString"])
    # Accept either {"email": {...}} or a bare email dict.
    return data.get("email", data)


def _download(bucket: str, key: str, dest: str) -> bool:
    try:
        s3.download_file(bucket, key, dest)
        return True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "403"):
            return False
        raise


def _upload(bucket: str, key: str, src: str) -> None:
    if os.path.exists(src):
        s3.upload_file(src, bucket, key)


def handler(event, context):
    event = event or {}
    reset_daily = bool(event.get("reset_daily", False))

    bucket = os.environ["STATE_BUCKET"]
    timezone = os.environ.get("TIMEZONE", "America/New_York")
    watchlist_key = os.environ.get("WATCHLIST_KEY", "watchlist.xlsx")
    alert_log_key = os.environ.get("ALERT_LOG_KEY", "alert_log.csv")

    watchlist_path = os.path.join(TMP, "watchlist.xlsx")
    alert_log_path = os.path.join(TMP, "alert_log.csv")

    # 1. Watchlist is required.
    if not _download(bucket, watchlist_key, watchlist_path):
        raise RuntimeError(
            f"watchlist not found at s3://{bucket}/{watchlist_key}. "
            "Upload it first (see deploy/SERVERLESS.md)."
        )

    # 2. Alert-log dedup state. On the noon run we reset (fresh day);
    #    on the 3pm run we keep prior state so we don't re-email the same breach.
    if os.path.exists(alert_log_path):
        os.remove(alert_log_path)
    if not reset_daily:
        _download(bucket, alert_log_key, alert_log_path)

    # 3. Build config.json in /tmp (the app modules read config from disk).
    email_cfg = _load_email_config()
    config = {
        "email": email_cfg,
        "sms": {"enabled": False},
        "monitoring": {
            "check_interval_seconds": 30,
            "market_open": "09:30",
            "market_close": "16:00",
            "timezone": timezone,
            "price_source": "yfinance",
        },
        "files": {
            "watchlist_excel": watchlist_path,
            "alert_log": alert_log_path,
        },
    }
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f)

    # Import here so cold-start cost is paid inside the handler timeout window.
    from monitor import PriceMonitor
    from notifier import Notifier

    monitor = PriceMonitor(CONFIG_PATH)
    notifier = Notifier(CONFIG_PATH)

    alerts = monitor.check_prices(use_cached=False)
    sent = False
    if alerts:
        notifier.send_alert(alerts)
        sent = True

    # 4. Persist updated prices + alert log back to S3.
    _upload(bucket, watchlist_key, watchlist_path)
    _upload(bucket, alert_log_key, alert_log_path)

    result = {
        "reset_daily": reset_daily,
        "alerts_triggered": len(alerts),
        "email_sent": sent,
    }
    print(json.dumps(result))
    return result
