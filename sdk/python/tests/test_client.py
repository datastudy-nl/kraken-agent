"""Tests for KrakenClient — chat, health, lifecycle, and sub-client wiring."""

import httpx
import pytest
import respx

from kraken.client import KrakenClient
from kraken.models import ChatResponse, HealthStatus


@pytest.fixture
def client():
    c = KrakenClient(api_url="http://localhost:8080", model="gpt-5.4", api_key="sk-test")
    yield c
    c.close()


NOW_ISO = "2026-03-29T10:00:00Z"


@respx.mock
class TestChat:
    def test_basic_chat(self, client):
        respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(200, json={
                "id": "resp-1",
                "session_id": "sess-1",
                "content": "Hello back!",
                "model": "gpt-5.4",
                "created_at": NOW_ISO,
            })
        )
        result = client.chat("Hello!")
        assert isinstance(result, ChatResponse)
        assert result.content == "Hello back!"
        assert result.model == "gpt-5.4"

    def test_chat_with_session_key(self, client):
        route = respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(200, json={
                "id": "resp-1",
                "session_id": "sess-1",
                "session_key": "discord-123",
                "content": "Hi!",
                "model": "gpt-5.4",
                "created_at": NOW_ISO,
            })
        )
        result = client.chat("Hello!", session_key="discord-123")
        assert isinstance(result, ChatResponse)
        body = route.calls.last.request.content
        assert b"discord-123" in body

    def test_chat_with_model_override(self, client):
        route = respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(200, json={
                "id": "resp-1",
                "session_id": "sess-1",
                "content": "From Claude",
                "model": "claude-4",
                "created_at": NOW_ISO,
            })
        )
        client.chat("Hello!", model="claude-4")
        body = route.calls.last.request.content
        assert b"claude-4" in body

    def test_chat_with_metadata(self, client):
        route = respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(200, json={
                "id": "resp-1",
                "session_id": "sess-1",
                "content": "Got it",
                "model": "gpt-5.4",
                "created_at": NOW_ISO,
            })
        )
        client.chat("Hello!", metadata={"discord_user": "alice"})
        body = route.calls.last.request.content
        assert b"discord_user" in body

    def test_chat_payload_omits_none_fields(self, client):
        route = respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(200, json={
                "id": "resp-1",
                "session_id": "sess-1",
                "content": "Hi",
                "model": "gpt-5.4",
                "created_at": NOW_ISO,
            })
        )
        client.chat("Hello!")
        body = route.calls.last.request.content
        assert b"session_id" not in body
        assert b"session_key" not in body
        assert b"metadata" not in body

    def test_chat_streaming_returns_iterator(self, client):
        respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(
                200,
                content=b"chunk1chunk2",
                headers={"content-type": "text/plain"},
            )
        )
        result = client.chat("Hello!", stream=True)
        # When streaming, returns an iterator (not ChatResponse)
        assert hasattr(result, "__iter__")


@respx.mock
class TestHealth:
    def test_health_check(self, client):
        respx.get("http://localhost:8080/health").mock(
            return_value=httpx.Response(200, json={
                "status": "ok",
                "version": "0.1.0",
                "uptime": 1234.5,
            })
        )
        status = client.health()
        assert isinstance(status, HealthStatus)
        assert status.status == "ok"
        assert status.version == "0.1.0"


class TestLifecycle:
    def test_context_manager(self):
        with KrakenClient(api_url="http://localhost:8080") as client:
            assert client is not None

    def test_close_is_idempotent(self):
        client = KrakenClient(api_url="http://localhost:8080")
        client.close()
        client.close()  # Should not raise


class TestSubClients:
    def test_has_sessions(self, client):
        from kraken.sessions import Sessions
        assert isinstance(client.sessions, Sessions)

    def test_has_memory(self, client):
        from kraken.memory import Memory
        assert isinstance(client.memory, Memory)

    def test_has_skills(self, client):
        from kraken.skills import Skills
        assert isinstance(client.skills, Skills)

    def test_has_tools(self, client):
        from kraken.tools import Tools
        assert isinstance(client.tools, Tools)

    def test_has_identity(self, client):
        from kraken.identity import Identity
        assert isinstance(client.identity, Identity)
