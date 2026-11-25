"""Structured error types for the market-data feature.

Every error carries a machine-readable `code`, a human `message`, an HTTP
`status`, and a `retryable` flag so the API layer can emit a consistent
`{"error": {...}}` body.
"""


class MarketDataError(Exception):
    code = "market_data_error"
    status = 500
    retryable = False

    def __init__(self, message=None, *, retryable=None):
        self.message = message or self.__class__.__doc__ or self.code
        if retryable is not None:
            self.retryable = retryable
        super().__init__(self.message)

    def to_dict(self):
        return {
            "code": self.code,
            "message": self.message,
            "retryable": bool(self.retryable),
        }


class InvalidParameterError(MarketDataError):
    """One or more request parameters are invalid."""

    code = "invalid_parameter"
    status = 400
    retryable = False


class SymbolNotFoundError(MarketDataError):
    """The provider verified that the requested symbol does not exist."""

    code = "symbol_not_found"
    status = 404
    retryable = False


class NoHistoryError(MarketDataError):
    """The provider returned a successful response but no historical bars."""

    code = "no_history"
    status = 404
    retryable = False


class ProviderUnavailableError(MarketDataError):
    """The upstream data provider failed or is unreachable."""

    code = "provider_unavailable"
    status = 502
    retryable = True


class ProviderThrottledError(MarketDataError):
    """The upstream data provider rate-limited the request."""

    code = "provider_throttled"
    status = 503
    retryable = True


class InsufficientHistoryError(MarketDataError):
    """Not enough completed bars to run the requested calculation."""

    code = "insufficient_history"
    status = 422
    retryable = False
