"""
Trade Alerts — Web Dashboard
Flask-based UI for managing watchlist, price targets, and monitoring.
"""

import os
import csv
import json
import threading
from datetime import datetime

import pytz
from flask import Flask, render_template, jsonify, request
from flask_cors import CORS

from excel_manager import read_watchlist, update_current_prices, create_watchlist_template
from price_fetcher import fetch_prices
from monitor import PriceMonitor
from notifier import Notifier

os.chdir(os.path.dirname(os.path.abspath(__file__)))

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True
CORS(app)


@app.after_request
def add_no_cache_headers(response):
    """Prevent browser from caching responses — always serve fresh content."""
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ---------------------------------------------------------------------------
# Globals for background monitor thread
# ---------------------------------------------------------------------------
monitor_thread = None
monitor_running = False
monitor_lock = threading.Lock()


def _load_config():
    with open("config.json", "r") as f:
        return json.load(f)


def _load_sectors():
    if os.path.exists("sectors.json"):
        with open("sectors.json", "r") as f:
            return json.load(f)
    return {}


def _save_sectors(data):
    with open("sectors.json", "w") as f:
        json.dump(data, f, indent=4)


# ---------------------------------------------------------------------------
# Helper: read / write targets via openpyxl directly (avoids full regenerate)
# ---------------------------------------------------------------------------
import openpyxl


def _ensure_watchlist():
    """Create watchlist.xlsx from sectors.json if it doesn't exist."""
    config = _load_config()
    wl_path = config["files"]["watchlist_excel"]
    if not os.path.exists(wl_path):
        sectors = _load_sectors()
        if sectors:
            create_watchlist_template(sectors, wl_path)


def _set_targets(ticker: str, sector: str, targets: list):
    """
    Write price targets for *ticker* into the watchlist Excel.

    targets: list of {"price": float, "direction": str} (max 3)
    """
    config = _load_config()
    wl_path = config["files"]["watchlist_excel"]
    _ensure_watchlist()

    wb = openpyxl.load_workbook(wl_path)
    saved = False

    for sheet_name in wb.sheetnames:
        if sheet_name == "Summary":
            continue
        ws = wb[sheet_name]
        for row in range(2, ws.max_row + 1):
            cell_val = ws[f"A{row}"].value
            if cell_val and str(cell_val).strip().upper() == ticker.upper():
                # Clear existing targets
                for col in ("D", "E", "F", "G", "H", "I"):
                    ws[f"{col}{row}"] = None

                # Write new targets (up to 3)
                col_pairs = [("D", "E"), ("F", "G"), ("H", "I")]
                for i, t in enumerate(targets[:3]):
                    price_col, dir_col = col_pairs[i]
                    ws[f"{price_col}{row}"] = t["price"]
                    ws[f"{dir_col}{row}"] = t.get("direction", "BOTH")
                saved = True
                break
        if saved:
            break

    wb.save(wl_path)
    wb.close()


def _add_ticker_to_excel(ticker: str, sector: str):
    """Append a new ticker row to the appropriate sector sheet."""
    config = _load_config()
    wl_path = config["files"]["watchlist_excel"]
    _ensure_watchlist()

    wb = openpyxl.load_workbook(wl_path)
    if sector not in wb.sheetnames:
        # Create new sheet with headers
        ws = wb.create_sheet(sector)
        headers = ["Ticker", "Company Name", "Current Price",
                    "Price Target 1", "Direction 1",
                    "Price Target 2", "Direction 2",
                    "Price Target 3", "Direction 3", "Notes"]
        for i, h in enumerate(headers, 1):
            ws.cell(row=1, column=i, value=h)
        next_row = 2
    else:
        ws = wb[sector]
        next_row = ws.max_row + 1

    ws[f"A{next_row}"] = ticker.upper()
    wb.save(wl_path)
    wb.close()


def _remove_ticker_from_excel(ticker: str, sector: str):
    """Remove a ticker row from the sector sheet."""
    config = _load_config()
    wl_path = config["files"]["watchlist_excel"]
    if not os.path.exists(wl_path):
        return

    wb = openpyxl.load_workbook(wl_path)
    if sector in wb.sheetnames:
        ws = wb[sector]
        for row in range(2, ws.max_row + 1):
            cell_val = ws[f"A{row}"].value
            if cell_val and str(cell_val).strip().upper() == ticker.upper():
                ws.delete_rows(row)
                break
    wb.save(wl_path)
    wb.close()


# ---------------------------------------------------------------------------
# Background monitor
# ---------------------------------------------------------------------------
def _monitor_loop():
    """Run the price monitor in a background thread."""
    global monitor_running
    import time

    config = _load_config()
    tz = pytz.timezone(config["monitoring"]["timezone"])
    interval = config["monitoring"]["check_interval_seconds"]

    mon = PriceMonitor()
    notifier = Notifier()
    last_day = None

    while monitor_running:
        now = datetime.now(tz)
        today = now.date()
        if last_day != today:
            mon.reset_alerts()
            last_day = today

        try:
            alerts = mon.check_prices()
            if alerts:
                notifier.send_alert(alerts)
        except Exception as e:
            print(f"Monitor error: {e}")

        # Sleep in small chunks so we can stop quickly
        for _ in range(interval):
            if not monitor_running:
                break
            time.sleep(1)


# ---------------------------------------------------------------------------
# Routes — Pages
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Routes — API
# ---------------------------------------------------------------------------
@app.get("/api/sectors")
def api_get_sectors():
    return jsonify(_load_sectors())


@app.post("/api/sectors/stock")
def api_add_stock():
    data = request.get_json(force=True)
    sector = data.get("sector", "").strip()
    ticker = data.get("ticker", "").strip().upper()
    if not sector or not ticker:
        return jsonify({"error": "sector and ticker required"}), 400

    sectors = _load_sectors()
    if sector not in sectors:
        sectors[sector] = []
    if ticker in sectors[sector]:
        return jsonify({"error": "ticker already exists in sector"}), 409
    sectors[sector].append(ticker)
    _save_sectors(sectors)

    # Also add to Excel
    _add_ticker_to_excel(ticker, sector)
    return jsonify({"ok": True})


@app.delete("/api/sectors/stock")
def api_remove_stock():
    data = request.get_json(force=True)
    sector = data.get("sector", "").strip()
    ticker = data.get("ticker", "").strip().upper()

    sectors = _load_sectors()
    if sector in sectors and ticker in sectors[sector]:
        sectors[sector].remove(ticker)
        if not sectors[sector]:
            del sectors[sector]
        _save_sectors(sectors)
        _remove_ticker_from_excel(ticker, sector)
    return jsonify({"ok": True})


@app.post("/api/sectors/add")
def api_add_sector():
    data = request.get_json(force=True)
    sector = data.get("sector", "").strip()
    if not sector:
        return jsonify({"error": "sector name required"}), 400
    sectors = _load_sectors()
    if sector in sectors:
        return jsonify({"error": "sector already exists"}), 409
    sectors[sector] = []
    _save_sectors(sectors)
    return jsonify({"ok": True})


@app.delete("/api/sectors/<sector_name>")
def api_delete_sector(sector_name):
    sectors = _load_sectors()
    if sector_name in sectors:
        del sectors[sector_name]
        _save_sectors(sectors)
    return jsonify({"ok": True})


@app.get("/api/watchlist")
def api_get_watchlist():
    """Return full watchlist with targets, grouped by sector."""
    _ensure_watchlist()
    config = _load_config()
    wl_path = config["files"]["watchlist_excel"]

    try:
        items = read_watchlist(wl_path)
    except FileNotFoundError:
        items = []

    # Also read current prices from the Excel
    prices = {}
    if os.path.exists(wl_path):
        wb = openpyxl.load_workbook(wl_path, data_only=True)
        for sn in wb.sheetnames:
            if sn == "Summary":
                continue
            ws = wb[sn]
            for row in range(2, ws.max_row + 1):
                t = ws[f"A{row}"].value
                p = ws[f"C{row}"].value
                if t:
                    try:
                        prices[str(t).strip().upper()] = float(p) if p else None
                    except (ValueError, TypeError):
                        prices[str(t).strip().upper()] = None
        wb.close()

    # Merge into a sector-grouped structure
    sectors = _load_sectors()
    result = {}
    target_map = {item["ticker"]: item for item in items}

    for sector, tickers in sectors.items():
        result[sector] = []
        for tk in tickers:
            info = target_map.get(tk, {})
            result[sector].append({
                "ticker": tk,
                "current_price": prices.get(tk),
                "targets": info.get("targets", []),
            })
    return jsonify(result)


@app.post("/api/targets")
def api_set_targets():
    data = request.get_json(force=True)
    ticker = data.get("ticker", "").strip().upper()
    sector = data.get("sector", "").strip()
    targets = data.get("targets", [])

    if not ticker:
        return jsonify({"error": "ticker required"}), 400

    # Validate targets
    clean = []
    for t in targets:
        try:
            p = float(t["price"])
            d = str(t.get("direction", "BOTH")).upper()
            if d not in ("ABOVE", "BELOW", "BOTH"):
                d = "BOTH"
            clean.append({"price": p, "direction": d})
        except (KeyError, ValueError, TypeError):
            continue

    _set_targets(ticker, sector, clean)
    return jsonify({"ok": True, "saved": len(clean)})


@app.get("/api/prices/refresh")
def api_refresh_prices():
    """Fetch live prices for all tickers and update Excel."""
    sectors = _load_sectors()
    all_tickers = [t for tl in sectors.values() for t in tl]
    if not all_tickers:
        return jsonify({})

    prices = fetch_prices(all_tickers)

    config = _load_config()
    wl_path = config["files"]["watchlist_excel"]
    if os.path.exists(wl_path):
        try:
            update_current_prices(wl_path, prices)
        except Exception:
            pass

    return jsonify(prices)


@app.get("/api/alerts")
def api_get_alerts():
    config = _load_config()
    log_path = config["files"]["alert_log"]
    alerts = []
    if os.path.exists(log_path):
        with open(log_path, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                alerts.append(row)
    alerts.reverse()  # newest first
    return jsonify(alerts)


@app.get("/api/monitor/status")
def api_monitor_status():
    return jsonify({"running": monitor_running})


@app.post("/api/monitor/start")
def api_monitor_start():
    global monitor_thread, monitor_running
    with monitor_lock:
        if monitor_running:
            return jsonify({"status": "already running"})
        monitor_running = True
        monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
        monitor_thread.start()
    return jsonify({"status": "started"})


@app.post("/api/monitor/stop")
def api_monitor_stop():
    global monitor_running
    with monitor_lock:
        monitor_running = False
    return jsonify({"status": "stopped"})


@app.post("/api/check-once")
def api_check_once():
    """Run a single price check and return any alerts."""
    mon = PriceMonitor()
    alerts = mon.check_prices()
    return jsonify({"alerts": alerts, "count": len(alerts)})


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    _ensure_watchlist()
    app.run(debug=True, host="127.0.0.1", port=5000)
