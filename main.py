"""
Trade Alerts - Main Entry Point
================================
Stock price monitoring system with email/SMS alerts.

Usage:
    python main.py generate    - Generate Excel template from sectors dict
    python main.py monitor     - Start the price monitor (market hours only)
    python main.py test-email  - Send a test email notification
    python main.py test-price  - Test price fetching for a few tickers
    python main.py check-once  - Run one price check cycle immediately
"""

import sys
import os
import json

# Ensure we're running from the script's directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))


def cmd_generate():
    """Generate the Excel watchlist template from sectors data."""
    from excel_manager import create_watchlist_template
    from price_fetcher import fetch_company_names, fetch_prices
    
    sectors_file = "sectors.json"
    
    if not os.path.exists(sectors_file):
        print(f"❌ {sectors_file} not found!")
        print(f"   Create {sectors_file} with your sectors/tickers first.")
        print(f"   Example format:")
        print(json.dumps({
            "Technology": ["AAPL", "MSFT", "GOOGL"],
            "Energy": ["XOM", "CVX"]
        }, indent=4))
        return
    
    with open(sectors_file, "r") as f:
        sectors_data = json.load(f)
    
    # Load config for output file name
    with open("config.json", "r") as f:
        config = json.load(f)
    
    output_file = config["files"]["watchlist_excel"]
    
    print(f"📋 Generating watchlist template...")
    print(f"   Sectors: {list(sectors_data.keys())}")
    
    total = sum(len(v) for v in sectors_data.values())
    print(f"   Total stocks: {total}")
    
    # Generate template
    create_watchlist_template(sectors_data, output_file)
    
    # Try to fetch and fill in company names and current prices
    all_tickers = []
    for tickers in sectors_data.values():
        all_tickers.extend(tickers)
    
    print(f"\n📊 Fetching current prices for {len(all_tickers)} stocks...")
    try:
        prices = fetch_prices(all_tickers)
        from excel_manager import update_current_prices
        update_current_prices(output_file, prices)
        print(f"   Prices updated in Excel.")
        
        # Print summary
        for sector, tickers in sectors_data.items():
            print(f"\n   📁 {sector}:")
            for t in tickers:
                p = prices.get(t)
                print(f"      {t}: {'$' + str(p) if p else 'N/A'}")
    except Exception as e:
        print(f"   ⚠️  Could not fetch prices: {e}")
    
    print(f"\n✅ Done! Open '{output_file}' and fill in your price targets.")
    print(f"   Then run: python main.py monitor")


def cmd_monitor():
    """Start the price monitor."""
    from scheduler import MarketScheduler
    
    config_path = "config.json"
    
    # Verify watchlist exists
    with open(config_path, "r") as f:
        config = json.load(f)
    
    watchlist = config["files"]["watchlist_excel"]
    if not os.path.exists(watchlist):
        print(f"❌ Watchlist not found: {watchlist}")
        print(f"   Run 'python main.py generate' first, then fill in price targets.")
        return
    
    scheduler = MarketScheduler(config_path)
    scheduler.run()


def cmd_check_once():
    """Run a single price check cycle (ignores market hours)."""
    from monitor import PriceMonitor
    from notifier import Notifier
    
    print("🔍 Running single price check...")
    monitor = PriceMonitor()
    notifier = Notifier()
    
    alerts = monitor.check_prices()
    if alerts:
        print(f"\n🚨 {len(alerts)} alert(s) triggered!")
        response = input("Send notifications? (y/n): ").strip().lower()
        if response == "y":
            notifier.send_alert(alerts)
    else:
        print("✅ No alerts triggered.")


def cmd_test_email():
    """Send a test email to verify configuration."""
    from notifier import Notifier
    notifier = Notifier()
    notifier.send_test_notification()


def cmd_test_price():
    """Test price fetching."""
    from price_fetcher import fetch_prices
    
    tickers = input("Enter tickers (comma-separated, e.g. AAPL,MSFT,GOOGL): ").strip()
    if not tickers:
        tickers = "AAPL,MSFT,GOOGL"
    
    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    
    print(f"\n📊 Fetching prices for: {', '.join(ticker_list)}")
    prices = fetch_prices(ticker_list)
    
    print(f"\nResults:")
    for t, p in prices.items():
        print(f"  {t}: {'$' + str(p) if p else 'N/A'}")


def main():
    commands = {
        "generate": cmd_generate,
        "monitor": cmd_monitor,
        "check-once": cmd_check_once,
        "test-email": cmd_test_email,
        "test-price": cmd_test_price,
    }
    
    if len(sys.argv) < 2 or sys.argv[1] not in commands:
        print(__doc__)
        print("Available commands:")
        for cmd in commands:
            print(f"  python main.py {cmd}")
        return
    
    commands[sys.argv[1]]()


if __name__ == "__main__":
    main()
