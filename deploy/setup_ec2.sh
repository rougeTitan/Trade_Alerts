#!/bin/bash
# =============================================================
# Trade Alerts - EC2 Setup Script
# Run this ONCE after SSH-ing into your new EC2 instance
# Usage: bash setup_ec2.sh
# =============================================================

set -e

echo "============================================"
echo "  Trade Alerts - EC2 Setup"
echo "============================================"

# Update system
echo "📦 Updating system packages..."
sudo yum update -y 2>/dev/null || sudo apt-get update -y 2>/dev/null

# Install Python 3 and pip
echo "🐍 Installing Python 3..."
sudo yum install python3 python3-pip -y 2>/dev/null || sudo apt-get install python3 python3-pip python3-venv -y 2>/dev/null

# Install nginx + certbot (web server + free TLS)
echo "🌐 Installing nginx + certbot..."
sudo yum install nginx -y 2>/dev/null || sudo apt-get install nginx -y 2>/dev/null
sudo yum install certbot python3-certbot-nginx -y 2>/dev/null || sudo apt-get install certbot python3-certbot-nginx -y 2>/dev/null
sudo systemctl enable nginx
sudo systemctl start nginx

# Create app directory
echo "📁 Setting up application directory..."
mkdir -p ~/trade-alerts
cd ~/trade-alerts

# Create virtual environment
echo "🔧 Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies (requirements.txt must be uploaded first; fallback list otherwise)
echo "📦 Installing Python packages..."
pip install --upgrade pip
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
else
  echo "   ⚠️  requirements.txt not found yet — installing fallback set."
  pip install yfinance openpyxl pytz schedule requests flask flask-cors gunicorn twilio
fi

echo ""
echo "============================================"
echo "  ✅ Setup complete!"
echo "============================================"
echo ""
echo "Next steps (see deploy/DEPLOY_EC2.md for detail):"
echo "  1. Upload project files + config.json to ~/trade-alerts/"
echo "  2. Upload exported web build to ~/trade-alerts/web/"
echo "  3. sudo cp deploy/gunicorn.service /etc/systemd/system/ && sudo systemctl enable --now gunicorn"
echo "  4. sudo cp deploy/nginx.conf /etc/nginx/conf.d/trade-alerts.conf && sudo nginx -t && sudo systemctl reload nginx"
echo "  5. (optional) sudo certbot --nginx -d your-domain.com"
echo ""
