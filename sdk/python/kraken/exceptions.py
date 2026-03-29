"""Kraken SDK exception types."""

from __future__ import annotations


class KrakenError(Exception):
    """Base exception for all Kraken SDK errors."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class AuthenticationError(KrakenError):
    """Raised when the API key is invalid or missing."""


class NotFoundError(KrakenError):
    """Raised when the requested resource does not exist."""


class RateLimitError(KrakenError):
    """Raised when the API rate limit is exceeded."""


class ServerError(KrakenError):
    """Raised when the API returns a 5xx error."""
