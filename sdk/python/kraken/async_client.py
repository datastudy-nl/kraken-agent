"""Async Kraken client — single entry point for async API operations."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from kraken._transport import AsyncTransport
from kraken.async_identity import AsyncIdentity
from kraken.async_memory import AsyncMemory
from kraken.async_sessions import AsyncSessions
from kraken.async_skills import AsyncSkills
from kraken.async_tools import AsyncTools
from kraken.models import ChatResponse, HealthStatus


class AsyncKrakenClient:
    """Async Python client for the Kraken Agent API."""

    def __init__(
        self,
        api_url: str = "http://localhost:8080",
        model: str | None = None,
        api_key: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        self.api_url = api_url
        self.model = model
        self._transport = AsyncTransport(api_url, api_key=api_key, timeout=timeout)

        self.sessions = AsyncSessions(self._transport)
        self.memory = AsyncMemory(self._transport)
        self.skills = AsyncSkills(self._transport)
        self.tools = AsyncTools(self._transport)
        self.identity = AsyncIdentity(self._transport)

    async def chat(
        self,
        message: str,
        *,
        session_id: str | None = None,
        session_key: str | None = None,
        session_name: str | None = None,
        model: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> ChatResponse:
        payload: dict[str, Any] = {"message": message, "stream": False}
        if session_id:
            payload["session_id"] = session_id
        if session_key:
            payload["session_key"] = session_key
        if session_name:
            payload["session_name"] = session_name
        selected_model = model or self.model
        if selected_model:
            payload["model"] = selected_model
        if metadata:
            payload["metadata"] = metadata

        data = await self._transport.post("/v1/chat", json=payload)
        return ChatResponse.model_validate(data)

    async def chat_stream(
        self,
        message: str,
        *,
        session_id: str | None = None,
        session_key: str | None = None,
        session_name: str | None = None,
        model: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        payload: dict[str, Any] = {"message": message, "stream": True}
        if session_id:
            payload["session_id"] = session_id
        if session_key:
            payload["session_key"] = session_key
        if session_name:
            payload["session_name"] = session_name
        selected_model = model or self.model
        if selected_model:
            payload["model"] = selected_model
        if metadata:
            payload["metadata"] = metadata

        async for chunk in self._transport.post_stream("/v1/chat", json=payload):
            yield chunk

    async def health(self) -> HealthStatus:
        data = await self._transport.get("/health")
        return HealthStatus.model_validate(data)

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> AsyncKrakenClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
