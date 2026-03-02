# 📈 Trade Alerts — Stock Price Monitoring & Alert System

A Python-based stock price monitoring system that tracks user-defined price targets across multiple sectors and sends **email/SMS notifications** when targets are breached. Designed to run autonomously during US market hours (Mon–Fri, 9:30 AM – 4:00 PM EST).

---

## 🔑 Features

- **87 stocks tracked** across 11 sectors (Communication, Consumer Discretionary, Energy, Financials, HealthCare, Industrials, Information Technology, Consumer Staples, ETFs, Mutual Funds, Tier 1 Stocks)
- **3 price targets per stock** with configurable direction (ABOVE / BELOW / BOTH)
- **Real-time price fetching** via Yahoo Finance (yfinance)
- **Email alerts** via Gmail SMTP with HTML-formatted reports
- **SMS alerts** via Twilio (optional)
- **Market-hours-only scheduling** — automatically sleeps nights, weekends, and holidays
- **Alert deduplication** — each target fires only once per day to prevent spam
- **Excel-based configuration** — manage all stocks and targets in a clean spreadsheet
- **Alert logging** — all triggered alerts recorded to CSV for review
- **Auto-restart** — systemd service for 24/7 cloud deployment

---

## 📁 Project Structure

```
Trade Alerts/
├── main.py                 # Entry point — all commands
├── monitor.py              # Price monitoring engine
├── price_fetcher.py        # Real-time price fetching (yfinance)
├── excel_manager.py        # Excel watchlist generator & reader
├── notifier.py             # Email (Gmail) and SMS (Twilio) notifications
├── scheduler.py            # Market hours scheduler
├── config.json             # Configuration (credentials, settings) — NOT in repo
├── config.sample.json      # Template for config.json
├── sectors.json            # Ticker symbols organized by sector
├── requirements.txt        # Python dependencies
├── watchlist.xlsx          # Excel with stocks & price targets — NOT in repo
├── alert_log.csv           # Log of all triggered alerts — NOT in repo
└── deploy/
    ├── setup_ec2.sh            # EC2 instance setup script
    ├── install_service.sh      # Install as systemd service
    └── trade-alerts.service    # systemd unit file
```

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/rougeTitan/Trade_Alerts.git
cd Trade_Alerts
pip install -r requirements.txt
```

### 2. Configure

```bash
cp config.sample.json config.json
```

Edit `config.json` with your credentials:

| Field | Description |
|---|---|
| `sender_email` | Your Gmail address |
| `sender_password` | Gmail App Password ([generate here](https://myaccount.google.com/apppasswords)) |
| `receiver_emails` | Email(s) to receive alerts |
| `check_interval_seconds` | How often to check prices (default: 30s) |

> **Note:** Gmail requires a 16-character App Password (not your regular password). Enable 2-Step Verification first, then generate one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).

### 3. Set Up Watchlist

Edit `sectors.json` with your tickers organized by sector:

```json
{
    "Technology": ["AAPL", "MSFT", "NVDA"],
    "Energy": ["XOM", "CVX"],
    "Financials": ["JPM", "V", "MA"]
}
```

Generate the Excel watchlist:

```bash
python main.py generate
```

This creates `watchlist.xlsx` with:
- One tab per sector
- All tickers with current prices auto-filled
- Green columns for your 3 price targets
- Yellow columns for direction (ABOVE/BELOW)

Open `watchlist.xlsx`, fill in your price targets, and save.

### 4. Run

```bash
python main.py monitor
```

The monitor will:
- Check prices every 30 seconds during market hours
- Sleep automatically outside Mon–Fri 9:30 AM – 4:00 PM EST
- Send email alerts when any price target is breached
- Log all alerts to `alert_log.csv`

---

## 📋 Commands

| Command | Description |
|---|---|
| `python main.py generate` | Generate Excel watchlist from `sectors.json` |
| `python main.py monitor` | Start the price monitor (market hours only) |
| `python main.py check-once` | Run a single price check cycle (ignores market hours) |
| `python main.py test-email` | Send a test email to verify configuration |
| `python main.py test-price` | Test price fetching for any tickers |

---

## 📊 How Price Monitoring Works

```
┌─────────────────────────────────────────────────┐
│                  Scheduler                       │
│  Runs Mon-Fri 9:30 AM - 4:00 PM EST            │
│  Sleeps outside market hours                     │
└────────────────────┬────────────────────────────┘
                     │ Every 30 seconds
                     ▼
┌─────────────────────────────────────────────────┐
│              Price Monitor                       │
│  1. Reads watchlist.xlsx (tickers + targets)    │
│  2. Fetches live prices via Yahoo Finance       │
│  3. Compares each price to 3 user targets       │
│  4. Detects breaches (ABOVE / BELOW / BOTH)     │
│  5. Deduplicates alerts (fire once per day)     │
└────────────────────┬────────────────────────────┘
                     │ If target breached
                     ▼
┌─────────────────────────────────────────────────┐
│               Notifier                           │
│  • Email via Gmail SMTP (HTML formatted)        │
│  • SMS via Twilio (optional)                    │
│  • Logs alert to alert_log.csv                  │
└─────────────────────────────────────────────────┘
```

### Alert Directions

| Direction | Alert Fires When |
|---|---|
| `ABOVE` | Stock price rises **above** your target |
| `BELOW` | Stock price drops **below** your target |
| `BOTH` (default) | Stock price **crosses** your target in either direction |

### Alert Deduplication

Each unique combination of `ticker + target_price + direction` fires **only once per trading day**. Alerts reset automatically at the start of each new trading day.

---

## 📧 Email Alert Example

When a target is breached, you'll receive an HTML email like this:

| Sector | Ticker | Current Price | Status | Target Price | Time |
|---|---|---|---|---|---|
| Technology | AAPL | $238.50 | CROSSED BELOW | $240.00 | 2026-03-02 10:15:00 EST |
| Financials | SOFI | $14.10 | CROSSED BELOW | $14.00 | 2026-03-02 10:15:00 EST |

---

## ☁️ Cloud Deployment (AWS EC2)

Deploy to AWS EC2 free tier for 24/7 monitoring without keeping your laptop on.

### Setup

```bash
# SSH into your EC2 instance
ssh -i "your-key.pem" ec2-user@your-ec2-ip

# Clone the repo
git clone https://github.com/rougeTitan/Trade_Alerts.git
cd Trade_Alerts

# Run setup (installs Python, packages)
bash deploy/setup_ec2.sh

# Copy and configure settings
cp config.sample.json config.json
nano config.json  # Add your Gmail credentials

# Upload your watchlist.xlsx (from local machine)
# scp -i "your-key.pem" watchlist.xlsx ec2-user@your-ec2-ip:~/Trade_Alerts/

# Install as auto-start service
sudo bash deploy/install_service.sh
```

### Service Management

```bash
sudo systemctl status trade-alerts      # Check status
sudo systemctl stop trade-alerts        # Stop monitor
sudo systemctl start trade-alerts       # Start monitor
sudo systemctl restart trade-alerts     # Restart monitor
tail -f ~/trade-alerts/monitor.log      # View live logs
```

---

## ⚙️ Configuration Reference

### config.json

```json
{
    "email": {
        "enabled": true,                          // Enable email alerts
        "smtp_server": "smtp.gmail.com",          // SMTP server
        "smtp_port": 587,                         // SMTP port
        "sender_email": "you@gmail.com",          // Your Gmail
        "sender_password": "xxxx xxxx xxxx xxxx", // Gmail App Password
        "receiver_emails": ["you@gmail.com"]      // Alert recipients
    },
    "sms": {
        "enabled": false,                         // Enable SMS (needs Twilio)
        "twilio_account_sid": "...",
        "twilio_auth_token": "...",
        "twilio_from_number": "+1...",
        "to_numbers": ["+1..."]
    },
    "monitoring": {
        "check_interval_seconds": 30,             // Price check frequency
        "market_open": "09:30",                   // Market open time (ET)
        "market_close": "16:00",                  // Market close time (ET)
        "timezone": "America/New_York",           // Timezone
        "price_source": "yfinance"                // Price data source
    },
    "files": {
        "watchlist_excel": "watchlist.xlsx",       // Watchlist file path
        "alert_log": "alert_log.csv"               // Alert log file path
    }
}
```

### sectors.json

```json
{
    "Sector Name": ["TICKER1", "TICKER2", "TICKER3"],
    "Another Sector": ["TICK4", "TICK5"]
}
```

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `yfinance` | Real-time stock price data from Yahoo Finance |
| `openpyxl` | Excel file reading/writing |
| `pytz` | Timezone handling (US Eastern) |
| `schedule` | Task scheduling |
| `requests` | HTTP requests |
| `twilio` | SMS notifications (optional) |

---

## 🛡️ Security Notes

- `config.json` is in `.gitignore` — your credentials are **never pushed** to GitHub
- Use Gmail **App Passwords**, not your regular password
- `config.sample.json` is provided as a safe template
- On EC2, restrict SSH access to your IP only in the security group

---

## 📝 License

This project is for personal use. Feel free to fork and modify.
