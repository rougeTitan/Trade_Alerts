"""
Multi-user notifier using AWS SES.
Groups alerts by user, looks up each user's notifyEmail, and sends one email.
"""

import os
from datetime import datetime

import boto3

import db

SES_SENDER = os.environ.get("SES_SENDER", "")


def _format_message(user_id, alerts):
    count = len(alerts)
    tickers = ", ".join(sorted(set(a["ticker"] for a in alerts)))
    subject = f"Trade Alerts: {tickers} ({count} alert{'s' if count > 1 else ''})"

    lines = [
        f"STOCK PRICE ALERT - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "=" * 60,
        "",
    ]
    for a in alerts:
        lines.append(
            f"  {a['ticker']}: ${a['current_price']:.2f} "
            f"{a['direction']} target ${a['target_price']:.2f}"
        )
    lines.append("")
    lines.append("=" * 60)
    lines.append("This is an automated alert from Trade Alerts Monitor.")
    body_text = "\n".join(lines)

    html_rows = ""
    for a in alerts:
        color = "#dc3545" if "BELOW" in a["direction"] else "#28a745"
        html_rows += f"""
        <tr>
            <td style="padding:8px; border:1px solid #ddd;">{a.get('sector', '')}</td>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">{a['ticker']}</td>
            <td style="padding:8px; border:1px solid #ddd;">${a['current_price']:.2f}</td>
            <td style="padding:8px; border:1px solid #ddd; color:{color}; font-weight:bold;">{a['direction']}</td>
            <td style="padding:8px; border:1px solid #ddd;">${a['target_price']:.2f}</td>
            <td style="padding:8px; border:1px solid #ddd;">{a.get('timestamp', '')}</td>
        </tr>
        """

    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif;">
        <h2 style="color: #2F5496;">🚨 Stock Price Alert</h2>
        <p>The following price targets have been breached:</p>
        <table style="border-collapse: collapse; width: 100%;">
            <thead>
                <tr style="background-color: #2F5496; color: white;">
                    <th style="padding:8px; border:1px solid #ddd;">Sector</th>
                    <th style="padding:8px; border:1px solid #ddd;">Ticker</th>
                    <th style="padding:8px; border:1px solid #ddd;">Current Price</th>
                    <th style="padding:8px; border:1px solid #ddd;">Status</th>
                    <th style="padding:8px; border:1px solid #ddd;">Target Price</th>
                    <th style="padding:8px; border:1px solid #ddd;">Time</th>
                </tr>
            </thead>
            <tbody>
                {html_rows}
            </tbody>
        </table>
        <br>
        <p style="color: #666; font-size: 12px;">Automated alert from Trade Alerts Monitor</p>
    </body>
    </html>
    """

    return subject, body_text, body_html


def send_alerts(per_user_alerts):
    if not SES_SENDER:
        print("⚠️  SES_SENDER not set; skipping email notifications.")
        return {}
    if not per_user_alerts:
        return {}

    client = boto3.client("ses", region_name=os.environ.get("SES_REGION", os.environ.get("AWS_REGION", "us-east-1")))
    results = {}

    for user_id, alerts in per_user_alerts.items():
        profile = db.get_profile(user_id)
        to_email = profile.get("notifyEmail") if profile else None
        if not to_email:
            print(f"⚠️  No notifyEmail for user {user_id}; skipping.")
            results[user_id] = 0
            continue

        subject, body_text, body_html = _format_message(user_id, alerts)
        try:
            client.send_email(
                Source=SES_SENDER,
                Destination={"ToAddresses": [to_email]},
                Message={
                    "Subject": {"Data": subject},
                    "Body": {
                        "Text": {"Data": body_text},
                        "Html": {"Data": body_html},
                    },
                },
            )
            print(f"📧 Email sent to {to_email} ({len(alerts)} alerts)")
            results[user_id] = len(alerts)
        except Exception as e:
            print(f"❌ Email to {to_email} failed: {e}")
            results[user_id] = 0

    return results
