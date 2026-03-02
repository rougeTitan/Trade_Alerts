#!/bin/bash
# =============================================================
# Install Trade Alerts as a systemd service (auto-start on boot)
# Run with: sudo bash install_service.sh
# =============================================================

set -e

echo "📋 Installing Trade Alerts as a system service..."

# Copy service file
sudo cp trade-alerts.service /etc/systemd/system/trade-alerts.service

# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable trade-alerts

# Start the service now
sudo systemctl start trade-alerts

echo ""
echo "============================================"
echo "  ✅ Service installed and started!"
echo "============================================"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status trade-alerts    # Check status"
echo "  sudo systemctl stop trade-alerts      # Stop monitor"
echo "  sudo systemctl start trade-alerts     # Start monitor"
echo "  sudo systemctl restart trade-alerts   # Restart monitor"
echo "  tail -f ~/trade-alerts/monitor.log    # View live logs"
echo "  tail -f ~/trade-alerts/monitor_error.log  # View errors"
echo ""
