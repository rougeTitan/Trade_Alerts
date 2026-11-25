# Market Data & Automatic Target Generation (backend only)

Backend-only historical daily market-data feed and deterministic
support/resistance target preview for Trade Alerts.

> **Data source:** UNOFFICIAL Yahoo Finance via the [`yfinance`](https://pypi.org/project/yfinance/)
> library. For internal development/integration only. **Not licensed for
> commercial redistribution** of the underlying data.

This feature is **read-only**. It does **not** add UI, scheduled jobs, active
targets, or email. The target-preview endpoint only *calculates* — it never
saves targets, modifies alert records, or sends notifications.

---

## What it adds

| Piece | File |
|---|---|
| Provider interface + Yahoo adapter | `market_data/provider.py` |
| SQLite bar cache + coverage | `market_data/cache.py` |
| Service (normalize/validate/completeness/cache orchestration) | `market_data/service.py` |
| Target algorithm (ATR, swings, clustering, visits, scoring) | `market_data/targets.py` |
| Flask blueprint (endpoints + structured errors) | `market_data/routes.py` |

The provider sits behind the `HistoricalDataProvider` interface so a licensed
provider can replace Yahoo later without touching the cache/service/algorithm.

---

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `MARKET_DATA_DB` | `market_data.db` | SQLite cache path (dev). |

The production app stores user data in DynamoDB, but historical OHLCV is a
shared read-mostly dataset, so a local relational cache is used. Upstream Yahoo
calls are kept off the request hot path (cache TTL = 1h; incremental refresh
with an overlapping window; full refresh re-pulls adjusted history).

---

## Startup

```bash
# from the repo root
python -m venv .venv
.venv/Scripts/activate            # Windows
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt

# run the existing Flask app (the blueprint auto-registers)
python app.py                     # serves on http://127.0.0.1:5000
# or pick a port:  PORT=5001 python app.py
```

The blueprint mounts at `/api/market-data` and is always available (it does not
require DynamoDB/Cognito). Endpoints are unauthenticated to match the legacy
local `/api` routes — this is a feed-verification tool, not a user feature.

---

## Endpoints

### `GET /api/market-data/history`

| Param | Default | Rules |
|---|---|---|
| `symbol` | — | required (e.g. `AAPL`, `SPY`, `QQQ`) |
| `lookback_years` | 2 | integer 1–5 |
| `limit` | 10 | 1–1500 most-recent bars returned |
| `refresh` | false | bypass cache / re-pull adjusted history |

Full requested history is fetched/cached even though only the most recent
`limit` bars are returned. `latest_completed_close` excludes an unfinished
daily candle (determined via exchange timezone + 16:00 close, weekends rolled
back; holidays are not treated as missing sessions).

### `GET /api/market-data/targets/preview`

| Param | Default | Rules |
|---|---|---|
| `symbol` | — | required |
| `direction` | `up` | `up` or `down` |
| `lookback_years` | 2 | integer 1–5 |
| `reference_price` | — | optional positive number; else latest completed close |
| `refresh` | false | bypass cache |

Algorithm v1 (deterministic): Wilder ATR(14) → strict 5/5 swing pivots →
price clustering bounded by `0.5 × ATR` → independent-visit counting (pivots
`< 5` bars apart collapse into one visit; `≥ 2` visits required) →
time-decayed strength `0.5 ** (age_bars / 126)` → directional filtering,
distance ordering, `≥ 1 × ATR` spacing, at most 3 targets. Fewer than three
targets returns fewer with a `reason`; no synthetic extensions are invented.

- `strength_score` is a **relative ranking score**, not a probability/confidence.
- A supplied `reference_price` **must use the same adjusted price basis**
  (`yfinance_auto_adjust`) as the bars. The completed daily close is **not** a
  live quote.
- Returned prices are rounded (2dp; ATR 4dp); intermediate math is not rounded.

### Errors

Structured as `{"error": {"code", "message", "retryable"}}`:

| HTTP | code | retryable |
|---|---|---|
| 400 | `invalid_parameter` | false |
| 404 | `symbol_not_found` / `no_history` | false |
| 422 | `insufficient_history` | false |
| 502 | `provider_unavailable` | true |
| 503 | `provider_throttled` | true |

Provider outages are **never** mislabeled as invalid symbols. If cached data is
served after an upstream failure, the response sets `stale: true` and adds a
warning.

---

## curl examples

```bash
# 1. AAPL history (2y, last 10 bars)
curl "http://127.0.0.1:5000/api/market-data/history?symbol=AAPL&lookback_years=2&limit=10"

# 2. SPY history with a forced refresh
curl "http://127.0.0.1:5000/api/market-data/history?symbol=SPY&refresh=true"

# 3. AAPL upside target preview
curl "http://127.0.0.1:5000/api/market-data/targets/preview?symbol=AAPL&direction=up"

# 4. AAPL downside target preview
curl "http://127.0.0.1:5000/api/market-data/targets/preview?symbol=AAPL&direction=down"
```

A real captured response is in `market_data/EXAMPLE_RESPONSE.md`.

---

## Tests

No live network is used — the provider is mocked and candles are synthetic.

```bash
pip install -r requirements-dev.txt
pytest tests
```

Covered: valid history, invalid params, empty response, throttling/failure,
cache hit + refresh, duplicate/malformed bars, unfinished-candle exclusion,
ATR, swing confirmation timing (no look-ahead), clustering max-width,
independent-visit counting, up/down ordering + spacing, insufficient history,
fewer-than-three zones, and that the preview endpoint neither persists nor
emails.
