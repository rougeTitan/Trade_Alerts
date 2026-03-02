"""
Market Hours Scheduler
Runs the price monitor only during US market hours (Mon-Fri, 9:30 AM - 4:00 PM EST).
"""

import time
import json
import signal
import sys
from datetime import datetime, timedelta
import pytz

from monitor import PriceMonitor
from notifier import Notifier


class MarketScheduler:
    """Schedules price monitoring during market hours only."""
    
    def __init__(self, config_path: str = "config.json"):
        with open(config_path, "r") as f:
            self.config = json.load(f)
        
        self.tz = pytz.timezone(self.config["monitoring"]["timezone"])
        self.market_open = self._parse_time(self.config["monitoring"]["market_open"])
        self.market_close = self._parse_time(self.config["monitoring"]["market_close"])
        self.interval = self.config["monitoring"]["check_interval_seconds"]
        
        self.monitor = PriceMonitor(config_path)
        self.notifier = Notifier(config_path)
        
        self.running = True
        self.last_trading_day = None
        
        # Handle graceful shutdown
        signal.signal(signal.SIGINT, self._shutdown)
        signal.signal(signal.SIGTERM, self._shutdown)
    
    def _parse_time(self, time_str: str):
        """Parse time string like '09:30' into hour and minute."""
        parts = time_str.split(":")
        return int(parts[0]), int(parts[1])
    
    def _shutdown(self, signum, frame):
        """Handle graceful shutdown."""
        print("\n🛑 Shutting down Trade Alerts Monitor...")
        self.running = False
        sys.exit(0)
    
    def is_market_hours(self) -> bool:
        """Check if current time is within market hours (Mon-Fri, 9:30-16:00 ET)."""
        now = datetime.now(self.tz)
        
        # Check weekday (0=Monday, 6=Sunday)
        if now.weekday() >= 5:  # Saturday or Sunday
            return False
        
        # Check time
        current_minutes = now.hour * 60 + now.minute
        open_minutes = self.market_open[0] * 60 + self.market_open[1]
        close_minutes = self.market_close[0] * 60 + self.market_close[1]
        
        return open_minutes <= current_minutes < close_minutes
    
    def time_until_market_open(self) -> timedelta:
        """Calculate time until next market open."""
        now = datetime.now(self.tz)
        
        # Find the next weekday
        target = now.replace(
            hour=self.market_open[0], 
            minute=self.market_open[1], 
            second=0, 
            microsecond=0
        )
        
        if now >= target or now.weekday() >= 5:
            # Move to next day
            days_ahead = 1
            if now.weekday() == 4:  # Friday after market close
                days_ahead = 3
            elif now.weekday() == 5:  # Saturday
                days_ahead = 2
            elif now.weekday() == 6:  # Sunday
                days_ahead = 1
            target += timedelta(days=days_ahead)
        
        # Ensure target is a weekday
        while target.weekday() >= 5:
            target += timedelta(days=1)
        
        return target - now
    
    def run(self):
        """Main loop - monitors prices during market hours."""
        print("=" * 60)
        print("  📈 TRADE ALERTS MONITOR")
        print("=" * 60)
        print(f"  Timezone     : {self.config['monitoring']['timezone']}")
        print(f"  Market Hours : {self.config['monitoring']['market_open']} - {self.config['monitoring']['market_close']}")
        print(f"  Check Every  : {self.interval} seconds")
        print(f"  Watchlist    : {self.config['files']['watchlist_excel']}")
        print(f"  Email Alerts : {'ON' if self.config['email']['enabled'] else 'OFF'}")
        print(f"  SMS Alerts   : {'ON' if self.config['sms']['enabled'] else 'OFF'}")
        print("=" * 60)
        
        while self.running:
            now = datetime.now(self.tz)
            
            if self.is_market_hours():
                # Reset alerts at start of each new trading day
                today = now.date()
                if self.last_trading_day != today:
                    self.monitor.reset_alerts()
                    self.last_trading_day = today
                    print(f"\n📅 New trading day: {today.strftime('%A, %B %d, %Y')}")
                
                # Run price check
                try:
                    alerts = self.monitor.check_prices()
                    
                    # Send notifications for any triggered alerts
                    if alerts:
                        self.notifier.send_alert(alerts)
                
                except Exception as e:
                    print(f"❌ Error during price check: {e}")
                
                # Wait for next check
                time.sleep(self.interval)
            
            else:
                # Outside market hours
                wait_time = self.time_until_market_open()
                hours = int(wait_time.total_seconds() // 3600)
                minutes = int((wait_time.total_seconds() % 3600) // 60)
                
                print(f"\n💤 Market closed. Next open in {hours}h {minutes}m")
                print(f"   Current time: {now.strftime('%A %I:%M %p %Z')}")
                
                # Sleep in intervals so we can respond to shutdown
                # Check every 60 seconds if we should wake up
                sleep_seconds = min(wait_time.total_seconds(), 60)
                while sleep_seconds > 0 and self.running:
                    chunk = min(sleep_seconds, 60)
                    time.sleep(chunk)
                    sleep_seconds -= chunk
                    
                    # Re-check if market is now open
                    if self.is_market_hours():
                        break


if __name__ == "__main__":
    scheduler = MarketScheduler()
    scheduler.run()
