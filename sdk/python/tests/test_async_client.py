"""Tests for AsyncKrakenClient."""

import httpx
import pytest
import respx

from kraken.async_client import AsyncKrakenClient
from kraken.async_identity import AsyncIdentity
from kraken.async_memory import AsyncMemory
from kraken.async_schedules import AsyncSchedules
from kraken.async_sessions import AsyncSessions
from kraken.async_skills import AsyncSkills
from kraken.async_tools import AsyncTools
from kraken.models import ChatResponse, HealthStatus

NOW_ISO = "2026-03-29T10:00:00Z"


@pytest.fixture
async def async_client():
    client = AsyncKrakenClient(api_url="http://localhost:8080", model="gpt-5.4", api_key="sk-test")
    yield client
    await client.close()


@respx.mock
class TestAsyncChat:
    @pytest.mark.asyncio
    async def test_basic_chat(self, async_client):
        respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(200, json={
                "id": "resp-1",
                "session_id": "sess-1",
                "content": "Hello back!",
                "model": "gpt-5.4",
                "created_at": NOW_ISO,
            })
        )
        result = await async_client.chat("Hello!")
        assert isinstance(result, ChatResponse)
        assert result.content == "Hello back!"

    @pytest.mark.asyncio
    async def test_chat_stream(self, async_client):
        respx.post("http://localhost:8080/v1/chat").mock(
            return_value=httpx.Response(
                200,
                content=b"chunk1chunk2",
                headers={"content-type": "text/plain"},
            )
        )
        chunks = []
        async for chunk in async_client.chat_stream("Hello!"):
            chunks.append(chunk)
        assert "".join(chunks) == "chunk1chunk2"


@respx.mock
class TestAsyncHealth:
    @pytest.mark.asyncio
    async def test_health_check(self, async_client):
        respx.get("http://localhost:8080/health").mock(
            return_value=httpx.Response(200, json={
                "status": "ok",
                "version": "0.1.0",
                "uptime": 1234.5,
            })
        )
        status = await async_client.health()
        assert isinstance(status, HealthStatus)
        assert status.status == "ok"


class TestAsyncLifecycle:
    @pytest.mark.asyncio
    async def test_async_context_manager(self):
        async with AsyncKrakenClient(api_url="http://localhost:8080") as client:
            assert client is not None


class TestAsyncSubClients:
    @pytest.mark.asyncio
    async def test_has_subclients(self, async_client):
        assert isinstance(async_client.sessions, AsyncSessions)
        assert isinstance(async_client.memory, AsyncMemory)
        assert isinstance(async_client.skills, AsyncSkills)
        assert isinstance(async_client.tools, AsyncTools)
        assert isinstance(async_client.identity, AsyncIdentity)
        assert isinstance(async_client.schedules, AsyncSchedules)
