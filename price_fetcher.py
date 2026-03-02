"""
Price Fetcher Module
Fetches real-time stock prices using yfinance.
"""

import yfinance as yf
from datetime import datetime
import time


def fetch_prices(tickers: list) -> dict:
    """
    Fetch current prices for a list of tickers.
    
    Args:
        tickers: list of ticker symbols, e.g. ["AAPL", "MSFT"]
    
    Returns:
        dict: {"AAPL": 150.25, "MSFT": 380.10, ...}
        Returns None for tickers that fail to fetch.
    """
    prices = {}
    
    if not tickers:
        return prices
    
    try:
        # Batch download for efficiency (use 1-day period, 1-minute interval for real-time)
        ticker_str = " ".join(tickers)
        data = yf.download(ticker_str, period="1d", interval="1m", progress=False, threads=True)
        
        if data.empty:
            # Fallback: try individual fetches
            return _fetch_individual(tickers)
        
        # Get the latest closing price from intraday data
        if len(tickers) == 1:
            # Single ticker - data structure is different
            ticker = tickers[0]
            if not data.empty:
                latest = data["Close"].iloc[-1]
                prices[ticker] = round(float(latest), 2)
        else:
            # Multiple tickers
            for ticker in tickers:
                try:
                    if ticker in data["Close"].columns:
                        val = data["Close"][ticker].dropna()
                        if not val.empty:
                            prices[ticker] = round(float(val.iloc[-1]), 2)
                except (KeyError, IndexError):
                    continue
    except Exception as e:
        print(f"⚠️  Batch fetch error: {e}")
        return _fetch_individual(tickers)
    
    # Fill in any missing tickers with individual fetch
    missing = [t for t in tickers if t not in prices]
    if missing:
        individual = _fetch_individual(missing)
        prices.update(individual)
    
    return prices


def _fetch_individual(tickers: list) -> dict:
    """Fallback: fetch prices one by one."""
    prices = {}
    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            # Try fast_info first (newer yfinance), then info
            try:
                price = stock.fast_info.get("lastPrice") or stock.fast_info.get("last_price")
            except Exception:
                price = None
            
            if price is None:
                # Try getting from history
                hist = stock.history(period="1d", interval="1m")
                if not hist.empty:
                    price = hist["Close"].iloc[-1]
            
            if price is not None:
                prices[ticker] = round(float(price), 2)
            else:
                print(f"⚠️  Could not fetch price for {ticker}")
                prices[ticker] = None
        except Exception as e:
            print(f"⚠️  Error fetching {ticker}: {e}")
            prices[ticker] = None
    
    return prices


def fetch_company_names(tickers: list) -> dict:
    """
    Fetch company names for a list of tickers.
    
    Returns:
        dict: {"AAPL": "Apple Inc.", "MSFT": "Microsoft Corporation", ...}
    """
    names = {}
    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            names[ticker] = info.get("shortName") or info.get("longName") or ticker
        except Exception:
            names[ticker] = ticker
    return names


if __name__ == "__main__":
    # Quick test
    test_tickers = ["AAPL", "MSFT", "GOOGL"]
    print("Fetching prices...")
    prices = fetch_prices(test_tickers)
    for t, p in prices.items():
        print(f"  {t}: ${p}")
