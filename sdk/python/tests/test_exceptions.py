"""Tests for exception types."""

from kraken.exceptions import (
    AuthenticationError,
    KrakenError,
    NotFoundError,
    RateLimitError,
    ServerError,
)


class TestKrakenError:
    def test_message(self):
        err = KrakenError("Something went wrong")
        assert str(err) == "Something went wrong"
        assert err.status_code is None

    def test_with_status_code(self):
        err = KrakenError("Bad request", status_code=400)
        assert err.status_code == 400


class TestAuthenticationError:
    def test_inherits_kraken_error(self):
        err = AuthenticationError("Invalid API key", status_code=401)
        assert isinstance(err, KrakenError)
        assert err.status_code == 401


class TestNotFoundError:
    def test_inherits_kraken_error(self):
        err = NotFoundError("Not found", status_code=404)
        assert isinstance(err, KrakenError)


class TestRateLimitError:
    def test_inherits_kraken_error(self):
        err = RateLimitError("Rate limit exceeded", status_code=429)
        assert isinstance(err, KrakenError)
        assert err.status_code == 429


class TestServerError:
    def test_inherits_kraken_error(self):
        err = ServerError("Internal server error", status_code=500)
        assert isinstance(err, KrakenError)
