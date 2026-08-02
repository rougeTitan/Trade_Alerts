"""
AWS Lambda handler for the Trade Alerts web dashboard API (serverless hosting).

Wraps the existing Flask app (app.py) with apig-wsgi so it runs behind a Lambda
Function URL. State (watchlist.xlsx / sectors.json / alert_log.csv) lives in the
SAME S3 bucket the scheduled checker uses:

  cold start:  download state from S3 -> /tmp, build /tmp/config.json from the
               Secrets Manager email block, then import the Flask app (which is
               pinned to DATA_DIR=/tmp).
  each request: after the WSGI response, any state file whose mtime changed is
               uploaded back to S3 (so edits made in the dashboard persist and
               the scheduler picks them up).

Environment variables (set by Terraform):
  STATE_BUCKET   S3 bucket for watchlist.xlsx / sectors.json / alert_log.csv
  SECRET_ARN     Secrets Manager ARN whose value is the "email" config JSON
  TIMEZONE       IANA tz (default America/New_York)
"""

import os
import json

import boto3
from botocore.exceptions import ClientError

TMP = "/tmp"
STATE_FILES = ["watchlist.xlsx", "sectors.json", "alert_log.csv"]

# Pin the Flask app to /tmp and stop it from spawning the in-process monitor
# thread (the scheduled checker Lambda already handles alert checks).
os.environ["DATA_DIR"] = TMP
os.environ.setdefault("AUTO_START_MONITOR", "0")

s3 = boto3.client("s3")
secrets = boto3.client("secretsmanager")

_BUCKET = os.environ["STATE_BUCKET"]


def _load_email_config() -> dict:
    resp = secrets.get_secret_value(SecretId=os.environ["SECRET_ARN"])
    data = json.loads(resp["SecretString"])
    return data.get("email", data)


def _download(key: str, dest: str) -> bool:
    try:
        s3.download_file(_BUCKET, key, dest)
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "403"):
            return False
        raise


def _write_config():
    """Build /tmp/config.json the Flask app + Notifier expect."""
    config = {
        "email": _load_email_config(),
        "sms": {"enabled": False},
        "monitoring": {
            "check_interval_seconds": 30,
            "market_open": "09:30",
            "market_close": "16:00",
            "timezone": os.environ.get("TIMEZONE", "America/New_York"),
            "price_source": "yfinance",
        },
        "files": {
            "watchlist_excel": "watchlist.xlsx",
            "alert_log": "alert_log.csv",
        },
    }
    with open(os.path.join(TMP, "config.json"), "w") as f:
        json.dump(config, f)


def _mtime(name: str):
    p = os.path.join(TMP, name)
    return os.path.getmtime(p) if os.path.exists(p) else None


# ---- cold-start bootstrap ----------------------------------------------------
_write_config()
for _name in STATE_FILES:
    _download(_name, os.path.join(TMP, _name))

# Import AFTER state is in place (app.py runs _ensure_watchlist() on import).
from app import app  # noqa: E402
from apig_wsgi import make_lambda_handler  # noqa: E402

_wsgi = make_lambda_handler(app)
_mtimes = {name: _mtime(name) for name in STATE_FILES}


def _sync_up():
    """Push any changed state file back to S3 (or delete if removed)."""
    for name in STATE_FILES:
        current = _mtime(name)
        if current == _mtimes.get(name):
            continue
        path = os.path.join(TMP, name)
        try:
            if current is None:
                s3.delete_object(Bucket=_BUCKET, Key=name)
            else:
                s3.upload_file(path, _BUCKET, name)
            _mtimes[name] = current
        except ClientError as e:
            print(f"sync_up failed for {name}: {e}")


def handler(event, context):
    response = _wsgi(event, context)
    try:
        _sync_up()
    except Exception as e:  # never fail the request because of a sync error
        print(f"state sync error: {e}")
    return response
