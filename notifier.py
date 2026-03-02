"""
Notification System
Sends email and/or SMS alerts when price targets are breached.
"""

import smtplib
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime


class Notifier:
    """Handles sending notifications via email and SMS."""
    
    def __init__(self, config_path: str = "config.json"):
        with open(config_path, "r") as f:
            self.config = json.load(f)
        
        self.email_config = self.config.get("email", {})
        self.sms_config = self.config.get("sms", {})
    
    def send_alert(self, alerts: list):
        """
        Send notifications for triggered alerts.
        
        Args:
            alerts: list of alert dicts from PriceMonitor.check_prices()
        """
        if not alerts:
            return
        
        # Build message content
        subject, body_text, body_html = self._format_alert_message(alerts)
        
        # Send email
        if self.email_config.get("enabled", False):
            self._send_email(subject, body_text, body_html)
        
        # Send SMS
        if self.sms_config.get("enabled", False):
            sms_text = self._format_sms(alerts)
            self._send_sms(sms_text)
    
    def _format_alert_message(self, alerts: list) -> tuple:
        """Format alerts into email subject, plain text, and HTML body."""
        
        count = len(alerts)
        tickers = ", ".join(set(a["ticker"] for a in alerts))
        subject = f"🚨 Price Alert: {tickers} ({count} alert{'s' if count > 1 else ''})"
        
        # Plain text version
        lines = [
            f"STOCK PRICE ALERT - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"{'='*60}",
            ""
        ]
        
        # Group by sector
        sectors = {}
        for a in alerts:
            sector = a.get("sector", "Unknown")
            if sector not in sectors:
                sectors[sector] = []
            sectors[sector].append(a)
        
        for sector, sector_alerts in sectors.items():
            lines.append(f"📁 {sector}")
            lines.append(f"{'-'*40}")
            for a in sector_alerts:
                lines.append(
                    f"  {a['ticker']}: ${a['current_price']:.2f} "
                    f"{a['direction']} target ${a['target_price']:.2f}"
                )
            lines.append("")
        
        lines.append(f"{'='*60}")
        lines.append("This is an automated alert from Trade Alerts Monitor.")
        
        body_text = "\n".join(lines)
        
        # HTML version
        html_rows = ""
        for a in alerts:
            color = "#dc3545" if "BELOW" in a["direction"] else "#28a745"
            html_rows += f"""
            <tr>
                <td style="padding:8px; border:1px solid #ddd;">{a.get('sector','')}</td>
                <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">{a['ticker']}</td>
                <td style="padding:8px; border:1px solid #ddd;">${a['current_price']:.2f}</td>
                <td style="padding:8px; border:1px solid #ddd; color:{color}; font-weight:bold;">
                    {a['direction']}
                </td>
                <td style="padding:8px; border:1px solid #ddd;">${a['target_price']:.2f}</td>
                <td style="padding:8px; border:1px solid #ddd;">{a.get('timestamp','')}</td>
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
            <p style="color: #666; font-size: 12px;">
                Automated alert from Trade Alerts Monitor
            </p>
        </body>
        </html>
        """
        
        return subject, body_text, body_html
    
    def _format_sms(self, alerts: list) -> str:
        """Format alerts into a concise SMS message."""
        lines = ["PRICE ALERT:"]
        for a in alerts:
            lines.append(
                f"{a['ticker']} ${a['current_price']:.2f} "
                f"{a['direction']} ${a['target_price']:.2f}"
            )
        return "\n".join(lines)
    
    def _send_email(self, subject: str, body_text: str, body_html: str):
        """Send email notification."""
        try:
            smtp_server = self.email_config["smtp_server"]
            smtp_port = self.email_config["smtp_port"]
            sender = self.email_config["sender_email"]
            password = self.email_config["sender_password"]
            receivers = self.email_config["receiver_emails"]
            
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = sender
            msg["To"] = ", ".join(receivers)
            
            msg.attach(MIMEText(body_text, "plain"))
            msg.attach(MIMEText(body_html, "html"))
            
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(sender, password)
                server.sendmail(sender, receivers, msg.as_string())
            
            print(f"📧 Email sent to {', '.join(receivers)}")
        
        except Exception as e:
            print(f"❌ Email failed: {e}")
    
    def _send_sms(self, message: str):
        """Send SMS notification via Twilio."""
        try:
            from twilio.rest import Client
            
            account_sid = self.sms_config["twilio_account_sid"]
            auth_token = self.sms_config["twilio_auth_token"]
            from_number = self.sms_config["twilio_from_number"]
            to_numbers = self.sms_config["to_numbers"]
            
            client = Client(account_sid, auth_token)
            
            for to_number in to_numbers:
                sms = client.messages.create(
                    body=message,
                    from_=from_number,
                    to=to_number
                )
                print(f"📱 SMS sent to {to_number} (SID: {sms.sid})")
        
        except ImportError:
            print("❌ Twilio not installed. Run: pip install twilio")
        except Exception as e:
            print(f"❌ SMS failed: {e}")
    
    def send_test_notification(self):
        """Send a test notification to verify setup."""
        test_alerts = [{
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "sector": "TEST",
            "ticker": "TEST",
            "current_price": 100.00,
            "target_price": 99.00,
            "direction": "TEST ALERT",
            "status": "TEST"
        }]
        
        print("📧 Sending test notification...")
        self.send_alert(test_alerts)
        print("✅ Test complete. Check your email/phone.")


if __name__ == "__main__":
    notifier = Notifier()
    notifier.send_test_notification()
