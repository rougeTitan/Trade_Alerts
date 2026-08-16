"""
AWS Lambda handler for Trade Alerts (serverless scheduled checks).

Triggered by EventBridge Scheduler at 12:00 and 15:00 America/New_York.
Flow:
  DYNAMODB_TABLE set -> multi-user v2 (DynamoDB + SES)
  otherwise          -> legacy single-tenant (S3 + Excel + config email)

Environment variables (set by Terraform):
  DYNAMODB_TABLE      Optional — enables multi-user v2 backend
  SES_SENDER          Optional SES source address for v2
  STATE_BUCKET        S3 bucket for legacy state
  SECRET_ARN          Secrets Manager ARN for legacy email config
  TIMEZONE            IANA tz
  WATCHLIST_KEY       S3 key for legacy Excel
  ALERT_LOG_KEY       S3 key for legacy alert log

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
    arn = os.environ["SECRET_ARN"]
    resp = secrets.get_secret_value(SecretId=arn)
    data = json.loads(resp["SecretString"])
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


def _run_legacy(event):
    """Original single-tenant monitor using S3/Excel."""
    reset_daily = bool(event.get("reset_daily", False))

    bucket = os.environ["STATE_BUCKET"]
    timezone = os.environ.get("TIMEZONE", "America/New_York")
    watchlist_key = os.environ.get("WATCHLIST_KEY", "watchlist.xlsx")
    alert_log_key = os.environ.get("ALERT_LOG_KEY", "alert_log.csv")

    watchlist_path = os.path.join(TMP, "watchlist.xlsx")
    alert_log_path = os.path.join(TMP, "alert_log.csv")

    if not _download(bucket, watchlist_key, watchlist_path):
        raise RuntimeError(
            f"watchlist not found at s3://{bucket}/{watchlist_key}. "
            "Upload it first (see deploy/SERVERLESS.md)."
        )

    if os.path.exists(alert_log_path):
        os.remove(alert_log_path)
    if not reset_daily:
        _download(bucket, alert_log_key, alert_log_path)

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

    from monitor import PriceMonitor
    from notifier import Notifier

    monitor = PriceMonitor(CONFIG_PATH)
    notifier = Notifier(CONFIG_PATH)

    alerts = monitor.check_prices(use_cached=False)
    sent = False
    if alerts:
        notifier.send_alert(alerts)
        sent = True

    _upload(bucket, watchlist_key, watchlist_path)
    _upload(bucket, alert_log_key, alert_log_path)

    return {
        "reset_daily": reset_daily,
        "alerts_triggered": len(alerts),
        "email_sent": sent,
        "mode": "legacy",
    }


def _run_v2(event):
    """Multi-user monitor using DynamoDB + SES."""
    from monitor_v2 import check_prices
    from notifier_ses import send_alerts

    per_user_alerts = check_prices(event)
    sent = send_alerts(per_user_alerts) if per_user_alerts else {}

    return {
        "alerts_triggered": sum(len(v) for v in per_user_alerts.values()),
        "users_notified": sum(1 for v in sent.values() if v > 0),
        "mode": "v2",
    }


def handler(event, context):
    event = event or {}
    if os.environ.get("DYNAMODB_TABLE"):
        return _run_v2(event)
    return _run_legacy(event)
