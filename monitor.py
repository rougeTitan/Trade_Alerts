"""
Price Monitor Engine
Checks current prices against user-defined targets and triggers alerts.
"""

import os
import csv
import json
from datetime import datetime
import pytz

from price_fetcher import fetch_prices
from excel_manager import read_watchlist, update_current_prices


class PriceMonitor:
    """Monitors stock prices against target levels and triggers alerts."""
    
    def __init__(self, config_path: str = "config.json"):
        with open(config_path, "r") as f:
            self.config = json.load(f)
        
        self.watchlist_file = self.config["files"]["watchlist_excel"]
        self.alert_log_file = self.config["files"]["alert_log"]
        self.tz = pytz.timezone(self.config["monitoring"]["timezone"])
        
        # Track which alerts have already fired to avoid spam
        # Key: "TICKER_PRICE_DIRECTION", Value: True
        self.fired_alerts = self._load_fired_alerts()
        
        # Store previous prices to detect crossovers
        self.previous_prices = {}
    
    def _load_fired_alerts(self) -> set:
        """Load already-fired alerts from the log file to avoid re-alerting."""
        fired = set()
        if os.path.exists(self.alert_log_file):
            try:
                with open(self.alert_log_file, "r") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        # Use target_direction (ABOVE/BELOW/BOTH) not direction (breach type)
                        target_dir = row.get('target_direction', row.get('direction'))  # Fallback for old logs
                        key = f"{row.get('ticker')}_{row.get('target_price')}_{target_dir}"
                        fired.add(key)
            except Exception as e:
                print(f"⚠️  Could not load fired alerts: {e}")
        return fired
    
    def _log_alert(self, alert: dict):
        """Log a triggered alert to the CSV file."""
        file_exists = os.path.exists(self.alert_log_file)
        
        with open(self.alert_log_file, "a", newline="") as f:
            fieldnames = ["timestamp", "sector", "ticker", "current_price", 
                         "target_price", "target_direction", "direction", "status"]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            writer.writerow(alert)
    
    def reset_alerts(self):
        """Reset all fired alerts (e.g., at start of new trading day)."""
        self.fired_alerts = set()
        if os.path.exists(self.alert_log_file):
            # Keep the file but we reset in-memory tracking
            pass
        print("🔄 Alert tracking reset for new trading day.")
    
    def check_prices(self, use_cached: bool = False) -> list:
        """
        Main monitoring function. Fetches prices, compares to targets, returns alerts.
        
        Args:
            use_cached: If True, use current prices from Excel instead of fetching (for efficiency)
        
        Returns:
            List of alert dicts that were triggered this cycle.
        """
        # Read watchlist
        try:
            watchlist = read_watchlist(self.watchlist_file)
        except FileNotFoundError:
            print(f"❌ Watchlist file not found: {self.watchlist_file}")
            return []
        
        if not watchlist:
            print("⚠️  No stocks with price targets found in watchlist.")
            return []
        
        # Get all unique tickers
        all_tickers = list(set(item["ticker"] for item in watchlist))
        
        # Use cached prices from Excel or fetch fresh ones
        if use_cached:
            # Use existing prices from watchlist (already loaded)
            current_prices = {}
            for item in watchlist:
                ticker = item["ticker"]
                if "current_price" in item and item["current_price"] is not None:
                    current_prices[ticker] = item["current_price"]
            print(f"📊 Using cached prices for {len(current_prices)} stocks...")
        else:
            # Fetch current prices
            print(f"📊 Fetching fresh prices for {len(all_tickers)} stocks...")
            current_prices = fetch_prices(all_tickers)
            
            if not current_prices:
                print("❌ Failed to fetch any prices.")
                return []
            
            # Update Excel with current prices
            try:
                update_current_prices(self.watchlist_file, current_prices)
            except Exception as e:
                print(f"⚠️  Could not update Excel prices: {e}")
        
        # Check each stock against its targets
        triggered_alerts = []
        now = datetime.now(self.tz)
        
        for item in watchlist:
            ticker = item["ticker"]
            sector = item["sector"]
            price = current_prices.get(ticker)
            
            if price is None:
                continue
            
            prev_price = self.previous_prices.get(ticker)
            
            for target in item["targets"]:
                if not target:
                    continue
                target_price = target["price"]
                direction = target["direction"]
                
                alert_key = f"{ticker}_{target_price}_{direction}"
                
                # Skip if already fired
                if alert_key in self.fired_alerts:
                    continue
                
                triggered = False
                breach_type = ""
                
                if direction == "ABOVE":
                    if price >= target_price:
                        triggered = True
                        breach_type = "CROSSED ABOVE"
                elif direction == "BELOW":
                    if price <= target_price:
                        triggered = True
                        breach_type = "CROSSED BELOW"
                elif direction == "BOTH":
                    # Check if price crossed the target in either direction
                    if prev_price is not None:
                        if prev_price < target_price <= price:
                            triggered = True
                            breach_type = "CROSSED ABOVE"
                        elif prev_price > target_price >= price:
                            triggered = True
                            breach_type = "CROSSED BELOW"
                    else:
                        # First check - alert if price is within 0.5% of target
                        pct_diff = abs(price - target_price) / target_price * 100
                        if pct_diff <= 0.5:
                            triggered = True
                            breach_type = "AT TARGET"
                
                if triggered:
                    alert = {
                        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S %Z"),
                        "sector": sector,
                        "ticker": ticker,
                        "current_price": price,
                        "target_price": target_price,
                        "target_direction": direction,  # Original target direction (ABOVE/BELOW/BOTH)
                        "direction": breach_type,  # Actual breach type (CROSSED ABOVE/CROSSED BELOW)
                        "status": "TRIGGERED"
                    }
                    triggered_alerts.append(alert)
                    self.fired_alerts.add(alert_key)
                    self._log_alert(alert)
                    
                    print(f"🚨 ALERT: {ticker} ({sector}) - ${price} {breach_type} target ${target_price}")
            
            # Update previous price
            self.previous_prices[ticker] = price
        
        if not triggered_alerts:
            print(f"✅ {now.strftime('%H:%M:%S')} - All {len(all_tickers)} stocks checked. No new alerts.")
        else:
            print(f"🚨 {len(triggered_alerts)} alert(s) triggered!")
        
        return triggered_alerts


if __name__ == "__main__":
    monitor = PriceMonitor()
    alerts = monitor.check_prices()
    if alerts:
        for a in alerts:
            print(f"  {a['ticker']}: ${a['current_price']} {a['direction']} ${a['target_price']}")
