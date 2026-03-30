"""Async sessions operations."""

from __future__ import annotations

from typing import Any

from kraken._transport import AsyncTransport
from kraken.models import Message, Session, SessionDetail


class AsyncSessions:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def list(self, *, limit: int = 50, offset: int = 0) -> list[Session]:
        data = await self._t.get("/v1/sessions", params={"limit": limit, "offset": offset})
        return [Session.model_validate(s) for s in data["sessions"]]

    async def create(
        self,
        *,
        session_key: str | None = None,
        name: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Session:
        payload: dict[str, Any] = {}
        if session_key is not None:
            payload["session_key"] = session_key
        if name is not None:
            payload["name"] = name
        if metadata is not None:
            payload["metadata"] = metadata
        data = await self._t.post("/v1/sessions", json=payload)
        return Session.model_validate(data)

    async def get(self, session_id: str) -> SessionDetail:
        data = await self._t.get(f"/v1/sessions/{session_id}")
        return SessionDetail.model_validate(data)

    async def get_by_key(self, session_key: str) -> SessionDetail:
        data = await self._t.get(f"/v1/sessions/by-key/{session_key}")
        return SessionDetail.model_validate(data)

    async def delete(self, session_id: str) -> None:
        await self._t.delete(f"/v1/sessions/{session_id}")

    async def messages(
        self, session_id: str, *, limit: int = 100, offset: int = 0
    ) -> list[Message]:
        data = await self._t.get(
            f"/v1/sessions/{session_id}/messages",
            params={"limit": limit, "offset": offset},
        )
        return [Message.model_validate(m) for m in data["messages"]]
