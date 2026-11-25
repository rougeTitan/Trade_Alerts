# Example Response (captured from a real Yahoo Finance feed)

Captured via `yfinance` against live Yahoo Finance. UNOFFICIAL source; not for commercial redistribution.

## `GET /api/market-data/history?symbol=AAPL&lookback_years=2&limit=5`

```json
{
  "adjustment_method": "yfinance_auto_adjust",
  "bars": [
    {
      "close": 329.4,
      "date": "2026-09-29",
      "high": 337.09,
      "low": 328.7,
      "open": 336.97,
      "volume": 38478000
    },
    {
      "close": 333.02,
      "date": "2026-09-30",
      "high": 339.5,
      "low": 330.14,
      "open": 330.8,
      "volume": 49988600
    },
    {
      "close": 330.32,
      "date": "2026-10-01",
      "high": 332.48,
      "low": 325.81,
      "open": 330.0,
      "volume": 36306300
    },
    {
      "close": 333.69,
      "date": "2026-10-02",
      "high": 334.54,
      "low": 330.61,
      "open": 333.26,
      "volume": 33278600
    },
    {
      "close": 332.89,
      "date": "2026-10-05",
      "high": 336.21,
      "low": 331.65,
      "open": 332.82,
      "volume": 34350900
    }
  ],
  "cache_hit": false,
  "currency": "USD",
  "data_source_note": "UNOFFICIAL Yahoo Finance (yfinance); not licensed for commercial redistribution",
  "exchange_timezone": "America/New_York",
  "fetched_at": "2026-10-06T03:16:33.031233+00:00",
  "first_bar_date": "2024-10-01",
  "interval": "1d",
  "last_bar_date": "2026-10-05",
  "latest_completed_close": 332.89,
  "provider": "yahoo_finance",
  "requested_lookback_years": 2,
  "returned_bars": 5,
  "stale": false,
  "symbol": "AAPL",
  "total_bars": 504,
  "warnings": []
}
```

## `GET /api/market-data/targets/preview?symbol=AAPL&direction=up`

```json
{
  "adjustment_method": "yfinance_auto_adjust",
  "algorithm_version": "v1",
  "atr": 6.8567,
  "bars_analyzed": 504,
  "calculated_at": "2026-10-06T03:16:33.041308+00:00",
  "data_source_note": "UNOFFICIAL Yahoo Finance (yfinance); not licensed for commercial redistribution",
  "direction": "up",
  "interval": "1d",
  "last_completed_bar_date": "2026-10-05",
  "parameters": {
    "atr_period": 14,
    "cluster_max_span_atr": 0.5,
    "decay_halflife_bars": 126,
    "max_targets": 3,
    "min_independent_visits": 2,
    "min_spacing_atr": 1.0,
    "swing_strength": 5,
    "visit_separation_bars": 5
  },
  "provider": "yahoo_finance",
  "reason": "only 1 qualifying historical zone(s) found above the reference price with >= 2 independent visits and >= 1.0x ATR spacing; no synthetic percentage/ATR extensions were added",
  "reference_price": 332.89,
  "reference_price_note": "a supplied reference_price must use the same adjusted price basis as the bars (yfinance_auto_adjust); the completed daily close is NOT a live quote",
  "reference_price_source": "latest_completed_close",
  "strength_note": "strength_score is a relative ranking score, not a probability or confidence",
  "symbol": "AAPL",
  "targets": [
    {
      "alert_price": 344.27,
      "independent_visits": 2,
      "last_visit_date": "2026-09-22",
      "median_price": 344.81,
      "rank": 1,
      "source": "historical_price_zone",
      "strength_score": 1.7239,
      "zone_lower": 344.27,
      "zone_upper": 345.34
    }
  ],
  "timeframe": "daily",
  "warnings": []
}
```
