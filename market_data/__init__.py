"""
Historical market-data + automatic target-generation feature (backend only).

UNOFFICIAL Yahoo Finance data source via the `yfinance` library. For internal
development/integration use only — NOT licensed for commercial redistribution.

Public surface:
    from market_data.routes import market_data_bp
    app.register_blueprint(market_data_bp)
"""

ALGORITHM_VERSION = "v1"
PROVIDER_NAME = "yahoo_finance"
INTERVAL = "1d"
ADJUSTMENT_METHOD = "yfinance_auto_adjust"
