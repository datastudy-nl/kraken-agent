"""Tests for Sessions sub-client."""

import httpx
import pytest
import respx

from kraken._transport import Transport
from kraken.models import Message, Session, SessionDetail
from kraken.sessions import Sessions


@pytest.fixture
def sessions():
    transport = Transport("http://localhost:8080", api_key="sk-test")
    return Sessions(transport)


NOW_ISO = "2026-03-29T10:00:00Z"


@respx.mock
class TestSessionsList:
    def test_list_returns_sessions(self, sessions):
        respx.get("http://localhost:8080/v1/sessions").mock(
            return_value=httpx.Response(200, json={
                "sessions": [
                    {"id": "s-1", "created_at": NOW_ISO, "updated_at": NOW_ISO},
                    {"id": "s-2", "created_at": NOW_ISO, "updated_at": NOW_ISO},
                ]
            })
        )
        result = sessions.list()
        assert len(result) == 2
        assert all(isinstance(s, Session) for s in result)

    def test_list_with_pagination(self, sessions):
        route = respx.get("http://localhost:8080/v1/sessions").mock(
            return_value=httpx.Response(200, json={"sessions": []})
        )
        sessions.list(limit=5, offset=10)
        assert "limit=5" in str(route.calls.last.request.url)
        assert "offset=10" in str(route.calls.last.request.url)


@respx.mock
class TestSessionsCreate:
    def test_create_minimal(self, sessions):
        respx.post("http://localhost:8080/v1/sessions").mock(
            return_value=httpx.Response(200, json={
                "id": "s-new", "created_at": NOW_ISO, "updated_at": NOW_ISO,
            })
        )
        result = sessions.create()
        assert isinstance(result, Session)
        assert result.id == "s-new"

    def test_create_with_key_and_name(self, sessions):
        route = respx.post("http://localhost:8080/v1/sessions").mock(
            return_value=httpx.Response(200, json={
                "id": "s-new", "session_key": "discord-123",
                "name": "Test", "created_at": NOW_ISO, "updated_at": NOW_ISO,
            })
        )
        sessions.create(session_key="discord-123", name="Test")
        body = route.calls.last.request.content
        assert b"discord-123" in body
        assert b"Test" in body


@respx.mock
class TestSessionsGet:
    def test_get_by_id(self, sessions):
        respx.get("http://localhost:8080/v1/sessions/s-1").mock(
            return_value=httpx.Response(200, json={
                "id": "s-1", "created_at": NOW_ISO, "updated_at": NOW_ISO,
                "messages": [],
            })
        )
        result = sessions.get("s-1")
        assert isinstance(result, SessionDetail)

    def test_get_by_key(self, sessions):
        respx.get("http://localhost:8080/v1/sessions/by-key/discord-123").mock(
            return_value=httpx.Response(200, json={
                "id": "s-1", "session_key": "discord-123",
                "created_at": NOW_ISO, "updated_at": NOW_ISO,
                "messages": [],
            })
        )
        result = sessions.get_by_key("discord-123")
        assert isinstance(result, SessionDetail)
        assert result.session_key == "discord-123"


@respx.mock
class TestSessionsDelete:
    def test_delete(self, sessions):
        respx.delete("http://localhost:8080/v1/sessions/s-1").mock(
            return_value=httpx.Response(200, json={"deleted": True})
        )
        sessions.delete("s-1")  # Should not raise


@respx.mock
class TestSessionsMessages:
    def test_messages(self, sessions):
        respx.get("http://localhost:8080/v1/sessions/s-1/messages").mock(
            return_value=httpx.Response(200, json={
                "messages": [
                    {
                        "id": "m-1", "session_id": "s-1", "role": "user",
                        "content": "Hello", "timestamp": NOW_ISO,
                    },
                    {
                        "id": "m-2", "session_id": "s-1", "role": "assistant",
                        "content": "Hi!", "timestamp": NOW_ISO,
                    },
                ]
            })
        )
        result = sessions.messages("s-1")
        assert len(result) == 2
        assert all(isinstance(m, Message) for m in result)

    def test_messages_with_pagination(self, sessions):
        route = respx.get("http://localhost:8080/v1/sessions/s-1/messages").mock(
            return_value=httpx.Response(200, json={"messages": []})
        )
        sessions.messages("s-1", limit=10, offset=5)
        assert "limit=10" in str(route.calls.last.request.url)
        assert "offset=5" in str(route.calls.last.request.url)
