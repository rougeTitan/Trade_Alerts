"""Historical data provider interface + Yahoo Finance (yfinance) adapter.

The rest of the system depends only on `HistoricalDataProvider`, so a
professional/licensed provider can be dropped in later without touching the
cache, service, or target-calculation code.
"""

import math
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import List, Optional

from .errors import (
    ProviderThrottledError,
    ProviderUnavailableError,
    SymbolNotFoundError,
)


@dataclass
class RawBar:
    """A single daily OHLCV bar as returned by a provider (pre-normalization).

    Numeric fields may be NaN/inf; the service layer is responsible for
    cleaning them up.
    """

    date: str  # YYYY-MM-DD
    open: Optional[float]
    high: Optional[float]
    low: Optional[float]
    close: Optional[float]
    volume: Optional[float]


@dataclass
class ProviderResult:
    bars: List[RawBar] = field(default_factory=list)
    currency: Optional[str] = None
    exchange_timezone: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


class HistoricalDataProvider(ABC):
    """Pluggable source of daily historical OHLCV data."""

    #: short machine name, stored in the cache key
    name: str = "abstract"
    #: how the returned prices are adjusted; stored in the cache key
    adjustment_method: str = "none"

    @abstractmethod
    def fetch_daily(self, symbol: str, start: date, end: date) -> ProviderResult:
        """Return daily bars in [start, end]. Raise a MarketDataError subclass
        on failure. Return an empty `bars` list (not an error) when the symbol
        is valid but has no data in the window."""
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Yahoo Finance adapter
# ---------------------------------------------------------------------------
class YahooFinanceProvider(HistoricalDataProvider):
    """UNOFFICIAL Yahoo Finance adapter backed by the `yfinance` library.

    For development/integration only. Not licensed for commercial
    redistribution of the underlying data.
    """

    name = "yahoo_finance"
    adjustment_method = "yfinance_auto_adjust"

    # Bound how many upstream calls can run at once across the process so we
    # never hammer Yahoo from many concurrent requests.
    _semaphore = threading.Semaphore(
        4
    )

    def __init__(self, max_retries: int = 3, backoff_base: float = 0.5,
                 request_timeout: float = 20.0):
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.request_timeout = request_timeout

    # -- helpers ------------------------------------------------------------
    @staticmethod
    def _classify(exc: Exception):
        """Map an arbitrary upstream exception to the right error type.

        Precedence:
          * rate-limit signals            -> throttled (503, retryable)
          * yfinance "missing"/delisted   -> symbol not found (404)
          * everything else network/HTTP  -> unavailable (502, retryable)

        We only call something a bad symbol when yfinance *verifies* it (a
        dedicated missing/delisted exception or an explicit "not found"
        message) — a transport/HTTP outage is never downgraded to 404.
        """
        type_name = type(exc).__name__
        msg = str(exc).lower()

        if "ratelimit" in type_name.lower() or any(
            s in msg for s in ("too many requests", "rate limit", "429", "throttl")
        ):
            return ProviderThrottledError(f"Yahoo Finance throttled the request: {exc}")

        # Verified "this symbol has no listing" signals from yfinance.
        missing_types = {
            "YFTzMissingError", "YFTickerMissingError", "YFPricesMissingError",
            "YFInvalidPeriodError",
        }
        missing_msgs = ("delisted", "no timezone found", "not found",
                        "no price data found", "symbol may be delisted")
        if type_name in missing_types or any(s in msg for s in missing_msgs):
            return SymbolNotFoundError(f"symbol not found at provider: {exc}")

        return ProviderUnavailableError(f"Yahoo Finance request failed: {exc}")

    def _metadata(self, ticker):
        currency = None
        tz = None
        # history_metadata is populated after a .history() call.
        meta = getattr(ticker, "history_metadata", None) or {}
        if isinstance(meta, dict):
            currency = meta.get("currency")
            tz = meta.get("exchangeTimezoneName") or meta.get("timezone")
        if currency is None or tz is None:
            try:
                fi = ticker.fast_info
                currency = currency or fi.get("currency")
                tz = tz or fi.get("timezone")
            except Exception:
                pass
        return currency, tz

    # -- interface ----------------------------------------------------------
    def fetch_daily(self, symbol: str, start: date, end: date) -> ProviderResult:
        import yfinance as yf

        last_exc = None
        with self._semaphore:
            for attempt in range(self.max_retries):
                try:
                    ticker = yf.Ticker(symbol)
                    # end is inclusive for callers; yfinance treats end as
                    # exclusive, so push it one day forward.
                    df = ticker.history(
                        start=start.isoformat(),
                        end=(end + timedelta(days=1)).isoformat(),
                        interval="1d",
                        auto_adjust=True,
                        actions=True,
                        raise_errors=True,
                    )
                    currency, tz = self._metadata(ticker)
                    warnings = []
                    if currency is None:
                        warnings.append("currency could not be determined from provider")
                    if tz is None:
                        warnings.append("exchange timezone could not be determined from provider")

                    bars = self._dataframe_to_bars(df)
                    return ProviderResult(
                        bars=bars, currency=currency, exchange_timezone=tz,
                        warnings=warnings,
                    )
                except Exception as exc:  # noqa: BLE001 - we re-classify below
                    last_exc = exc
                    err = self._classify(exc)
                    # Backoff + retry only for retryable failures.
                    if attempt < self.max_retries - 1 and err.retryable:
                        time.sleep(self.backoff_base * (2 ** attempt))
                        continue
                    raise err from exc

        # Should be unreachable, but keep the type-checker/readers happy.
        raise self._classify(last_exc) if last_exc else ProviderUnavailableError()

    @staticmethod
    def _dataframe_to_bars(df) -> List[RawBar]:
        bars: List[RawBar] = []
        if df is None or len(df) == 0:
            return bars

        def _num(v):
            try:
                f = float(v)
            except (TypeError, ValueError):
                return None
            if math.isnan(f) or math.isinf(f):
                return None
            return f

        for idx, row in df.iterrows():
            # idx is a pandas Timestamp (tz-aware for intraday-origin data).
            d = idx.date().isoformat() if hasattr(idx, "date") else str(idx)[:10]
            bars.append(
                RawBar(
                    date=d,
                    open=_num(row.get("Open")),
                    high=_num(row.get("High")),
                    low=_num(row.get("Low")),
                    close=_num(row.get("Close")),
                    volume=_num(row.get("Volume")),
                )
            )
        return bars
