"""Tests for the Transport and HTTP layer."""

from unittest.mock import MagicMock, patch

import httpx
import pytest
import respx

from kraken._transport import Transport


@pytest.fixture
def transport():
    return Transport("http://localhost:8080", api_key="sk-test", timeout=5.0)


class TestTransportInit:
    def test_sets_base_url(self, transport):
        assert str(transport._client.base_url) == "http://localhost:8080"

    def test_sets_content_type_header(self, transport):
        assert transport._client.headers["content-type"] == "application/json"

    def test_sets_auth_header_when_api_key(self, transport):
        assert transport._client.headers["authorization"] == "Bearer sk-test"

    def test_no_auth_header_without_api_key(self):
        t = Transport("http://localhost:8080")
        assert "authorization" not in t._client.headers

    def test_strips_trailing_slash(self):
        t = Transport("http://localhost:8080/")
        assert str(t._client.base_url) == "http://localhost:8080"


@respx.mock
class TestTransportGet:
    def test_get_returns_json(self, transport):
        respx.get("http://localhost:8080/v1/health").mock(
            return_value=httpx.Response(200, json={"status": "ok"})
        )
        result = transport.get("/v1/health")
        assert result == {"status": "ok"}

    def test_get_with_params(self, transport):
        route = respx.get("http://localhost:8080/v1/sessions").mock(
            return_value=httpx.Response(200, json={"sessions": []})
        )
        transport.get("/v1/sessions", params={"limit": 10})
        assert route.called
        assert "limit=10" in str(route.calls.last.request.url)

    def test_get_raises_on_error(self, transport):
        respx.get("http://localhost:8080/v1/sessions/bad").mock(
            return_value=httpx.Response(404, json={"error": "not found"})
        )
        with pytest.raises(httpx.HTTPStatusError):
            transport.get("/v1/sessions/bad")


@respx.mock
class TestTransportPost:
    def test_post_sends_json(self, transport):
        route = respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(200, json={"id": "resp-1"})
        )
        result = transport.post("/v1/chat", json={"message": "Hello"})
        assert result == {"id": "resp-1"}
        assert route.calls.last.request.content == b'{"message": "Hello"}'

    def test_post_raises_on_500(self, transport):
        respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(500, json={"error": "internal"})
        )
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            transport.post("/v1/chat", json={"message": "Hello"})
        assert exc_info.value.response.status_code == 500


@respx.mock
class TestTransportPut:
    def test_put_sends_json(self, transport):
        respx.put("http://localhost:8080/v1/identity/soul").mock(
            return_value=httpx.Response(200, json={"content": "new soul"})
        )
        result = transport.put("/v1/identity/soul", json={"content": "new soul"})
        assert result["content"] == "new soul"


@respx.mock
class TestTransportPatch:
    def test_patch_sends_json(self, transport):
        respx.patch("http://localhost:8080/v1/skills/sk-1").mock(
            return_value=httpx.Response(200, json={"id": "sk-1"})
        )
        result = transport.patch("/v1/skills/sk-1", json={"content": "updated"})
        assert result == {"id": "sk-1"}


@respx.mock
class TestTransportDelete:
    def test_delete_succeeds(self, transport):
        respx.delete("http://localhost:8080/v1/sessions/s-1").mock(
            return_value=httpx.Response(200, json={"deleted": True})
        )
        result = transport.delete("/v1/sessions/s-1")
        assert result == {"deleted": True}


class TestTransportClose:
    def test_close_does_not_raise(self, transport):
        transport.close()
