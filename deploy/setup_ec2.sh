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

# Create app directory
echo "📁 Setting up application directory..."
mkdir -p ~/trade-alerts
cd ~/trade-alerts

# Create virtual environment
echo "🔧 Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "📦 Installing Python packages..."
pip install --upgrade pip
pip install yfinance openpyxl pytz schedule requests

echo ""
echo "============================================"
echo "  ✅ Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Upload your project files to ~/trade-alerts/"
echo "  2. Run: sudo bash install_service.sh"
echo "  3. The monitor will auto-start and run 24/7"
echo ""
