"""Orchestration layer: cache + provider + normalization + freshness.

Responsible for everything between the HTTP layer and the raw provider:
  * normalize symbols / dates / numeric types / column names
  * dedupe + sort bars chronologically
  * validate OHLC consistency and surface malformed data as warnings
  * decide which daily candle is "completed" using the exchange timezone
  * cache full history and serve it without hitting upstream on every request
  * serve stale cache (explicitly marked) after an upstream failure
"""

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Callable, List, Optional

from . import ADJUSTMENT_METHOD, INTERVAL, PROVIDER_NAME
from .cache import BarCache, Coverage
from .errors import NoHistoryError, ProviderUnavailableError, ProviderThrottledError
from .provider import HistoricalDataProvider

# Re-check upstream for new sessions at most this often (seconds). Protects the
# request hot path and avoids repeated no-op fetches on holidays/weekends.
CACHE_TTL_SECONDS = 3600
# Overlapping window re-fetched during incremental updates (calendar days).
INCREMENTAL_OVERLAP_DAYS = 10
# Default US equity session close used when a timezone is known.
_SESSION_CLOSE = time(16, 0)


@dataclass
class HistoryResult:
    symbol: str
    currency: Optional[str]
    exchange_timezone: Optional[str]
    fetched_at: str
    cache_hit: bool
    stale: bool
    requested_lookback_years: int
    bars: List[dict]                 # all normalized bars in window (chronological)
    completed_bars: List[dict]       # subset: completed daily sessions only
    first_bar_date: Optional[str]
    last_bar_date: Optional[str]
    latest_completed_close: Optional[float]
    warnings: List[str] = field(default_factory=list)


def _utcnow():
    return datetime.now(timezone.utc)


def _clean_num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


class MarketDataService:
    def __init__(self, provider: HistoricalDataProvider, cache: BarCache,
                 now_fn: Optional[Callable[[], datetime]] = None):
        self.provider = provider
        self.cache = cache
        self._now = now_fn or _utcnow
        self.interval = INTERVAL
        self.adjustment = getattr(provider, "adjustment_method", ADJUSTMENT_METHOD)
        self.provider_name = getattr(provider, "name", PROVIDER_NAME)

    # -- normalization ------------------------------------------------------
    @staticmethod
    def normalize_symbol(symbol: str) -> str:
        return (symbol or "").strip().upper()

    def normalize_bars(self, raw_bars) -> (List[dict], List[str]):
        """Clean, validate, dedupe (by date, last wins) and sort bars.

        Returns (bars, warnings). NaN/inf become null. Malformed OHLC rows are
        reported as warnings and dropped (they must not pollute calculations).
        """
        warnings: List[str] = []
        by_date = {}
        for b in raw_bars:
            d = b.date if hasattr(b, "date") else b["date"]
            d = str(d)[:10]
            o = _clean_num(b.open if hasattr(b, "open") else b.get("open"))
            h = _clean_num(b.high if hasattr(b, "high") else b.get("high"))
            lo = _clean_num(b.low if hasattr(b, "low") else b.get("low"))
            c = _clean_num(b.close if hasattr(b, "close") else b.get("close"))
            v = _clean_num(b.volume if hasattr(b, "volume") else b.get("volume"))
            by_date[d] = {
                "date": d, "open": o, "high": h, "low": lo, "close": c,
                "volume": int(v) if v is not None else None,
            }

        bars = []
        for d in sorted(by_date):
            row = by_date[d]
            o, h, lo, c = row["open"], row["high"], row["low"], row["close"]
            if None in (o, h, lo, c):
                warnings.append(f"dropped bar {d}: missing OHLC value")
                continue
            # OHLC consistency: high is the max, low is the min.
            if h < max(o, c, lo) or lo > min(o, c, h):
                warnings.append(f"dropped bar {d}: inconsistent OHLC (o={o} h={h} l={lo} c={c})")
                continue
            bars.append(row)
        return bars, warnings

    # -- completeness -------------------------------------------------------
    def _completed_cutoff(self, exchange_tz: Optional[str]):
        """Latest date (YYYY-MM-DD) whose daily session is finished.

        Uses exchange close in the exchange timezone. Weekends roll back to the
        prior weekday. Holidays are not treated as missing — we simply never
        advance the cutoff past a non-weekday.
        """
        now = self._now()
        if not exchange_tz:
            return None
        try:
            import pytz
            now_ex = now.astimezone(pytz.timezone(exchange_tz))
        except Exception:
            return None
        d = now_ex.date()
        if now_ex.time() >= _SESSION_CLOSE:
            cutoff = d
        else:
            cutoff = d - timedelta(days=1)
        while cutoff.weekday() >= 5:  # Sat/Sun
            cutoff -= timedelta(days=1)
        return cutoff.isoformat()

    def _split_completed(self, bars, exchange_tz):
        cutoff = self._completed_cutoff(exchange_tz)
        warnings = []
        if cutoff is None:
            # Without a timezone we conservatively treat only a bar dated today
            # (UTC) as potentially unfinished.
            today_utc = self._now().date().isoformat()
            completed = [b for b in bars if b["date"] < today_utc]
            if bars and bars[-1]["date"] >= today_utc:
                warnings.append(
                    f"exchange timezone unknown; treating {bars[-1]['date']} as "
                    "an unfinished session (completeness approximate)"
                )
            else:
                completed = bars
            return completed, warnings
        completed = [b for b in bars if b["date"] <= cutoff]
        if bars and bars[-1]["date"] > cutoff:
            warnings.append(
                f"latest bar {bars[-1]['date']} is an unfinished session and is "
                "excluded from latest_completed_close / target calculations"
            )
        return completed, warnings

    # -- freshness ----------------------------------------------------------
    def _expected_last_session(self, exchange_tz):
        return self._completed_cutoff(exchange_tz)

    def _lookback_start(self, lookback_years: int) -> date:
        return self._now().date() - timedelta(days=365 * lookback_years + 5)

    # -- main entry ---------------------------------------------------------
    def get_history(self, symbol: str, lookback_years: int = 2,
                    refresh: bool = False) -> HistoryResult:
        symbol = self.normalize_symbol(symbol)
        req_start = self._lookback_start(lookback_years)
        today = self._now().date()

        cov = self.cache.get_coverage(
            self.provider_name, symbol, self.interval, self.adjustment
        )
        warnings: List[str] = []
        stale = False
        did_upstream = False

        # Covered if we previously *requested* at least this far back. We track
        # the requested start (not the data's first_date) so a symbol with less
        # history than the window doesn't trigger an endless re-fetch loop.
        have_window = (
            cov is not None and cov.requested_start is not None
            and cov.requested_start <= req_start.isoformat()
        )

        if refresh or not have_window:
            # Full fetch — also the only path that can revise adjusted history.
            cov, fetch_warn, no_history = self._full_fetch(symbol, req_start, today, cov)
            warnings += fetch_warn
            did_upstream = True
            if no_history:
                raise NoHistoryError(
                    f"provider returned no historical bars for '{symbol}'"
                )
        else:
            # We already cover the window; decide whether to look for new bars.
            age = self._age_seconds(cov.fetched_at)
            expected_last = self._expected_last_session(cov.exchange_timezone)
            new_session = (
                expected_last is not None and cov.last_date is not None
                and cov.last_date < expected_last
            )
            if age is not None and age >= CACHE_TTL_SECONDS and new_session:
                try:
                    cov = self._incremental_fetch(symbol, cov, today)
                    did_upstream = True
                except (ProviderUnavailableError, ProviderThrottledError) as e:
                    stale = True
                    warnings.append(
                        f"served stale cached data after upstream failure: {e.message}"
                    )

        rows = self.cache.get_bars(
            self.provider_name, symbol, self.interval, self.adjustment,
            start_date=req_start.isoformat(),
        )
        if not rows:
            raise NoHistoryError(
                f"no cached history available for '{symbol}'"
            )

        completed, comp_warn = self._split_completed(rows, cov.exchange_timezone if cov else None)
        warnings += comp_warn
        latest_completed_close = completed[-1]["close"] if completed else None

        return HistoryResult(
            symbol=symbol,
            currency=cov.currency if cov else None,
            exchange_timezone=cov.exchange_timezone if cov else None,
            fetched_at=(cov.fetched_at if cov else _utcnow().isoformat()),
            cache_hit=not did_upstream,
            stale=stale,
            requested_lookback_years=lookback_years,
            bars=rows,
            completed_bars=completed,
            first_bar_date=rows[0]["date"] if rows else None,
            last_bar_date=rows[-1]["date"] if rows else None,
            latest_completed_close=latest_completed_close,
            warnings=warnings,
        )

    # -- fetch helpers ------------------------------------------------------
    def _full_fetch(self, symbol, req_start, today, prev_cov):
        result = self.provider.fetch_daily(symbol, req_start, today)
        bars, norm_warn = self.normalize_bars(result.bars)
        warnings = list(result.warnings) + norm_warn
        if not bars:
            return prev_cov, warnings, True
        self.cache.upsert_bars(
            self.provider_name, symbol, self.interval, self.adjustment, bars
        )
        cov = Coverage(
            provider=self.provider_name, symbol=symbol, interval=self.interval,
            adjustment_method=self.adjustment, first_date=bars[0]["date"],
            last_date=bars[-1]["date"], currency=result.currency,
            exchange_timezone=result.exchange_timezone,
            fetched_at=_utcnow().isoformat(),
            requested_start=req_start.isoformat(),
        )
        self.cache.set_coverage(cov)
        return cov, warnings, False

    def _incremental_fetch(self, symbol, cov, today):
        last = date.fromisoformat(cov.last_date)
        inc_start = last - timedelta(days=INCREMENTAL_OVERLAP_DAYS)
        result = self.provider.fetch_daily(symbol, inc_start, today)
        bars, _ = self.normalize_bars(result.bars)
        if bars:
            self.cache.upsert_bars(
                self.provider_name, symbol, self.interval, self.adjustment, bars
            )
        # Recompute coverage last_date from the cache (full range).
        all_rows = self.cache.get_bars(
            self.provider_name, symbol, self.interval, self.adjustment
        )
        new_cov = Coverage(
            provider=self.provider_name, symbol=symbol, interval=self.interval,
            adjustment_method=self.adjustment,
            first_date=all_rows[0]["date"] if all_rows else cov.first_date,
            last_date=all_rows[-1]["date"] if all_rows else cov.last_date,
            currency=result.currency or cov.currency,
            exchange_timezone=result.exchange_timezone or cov.exchange_timezone,
            fetched_at=_utcnow().isoformat(),
            requested_start=cov.requested_start,
        )
        self.cache.set_coverage(new_cov)
        return new_cov

    def _age_seconds(self, fetched_at):
        if not fetched_at:
            return None
        try:
            dt = datetime.fromisoformat(fetched_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
        return (self._now() - dt).total_seconds()
