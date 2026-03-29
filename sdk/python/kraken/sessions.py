"""Session management operations."""

from __future__ import annotations

from typing import Any

from kraken._transport import Transport
from kraken.models import Session, SessionDetail, Message


class Sessions:
    """Manage agent conversation sessions."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def list(self, *, limit: int = 20, offset: int = 0) -> list[Session]:
        """List all sessions."""
        data = self._t.get("/v1/sessions", params={"limit": limit, "offset": offset})
        return [Session.model_validate(s) for s in data["sessions"]]

    def create(
        self,
        *,
        metadata: dict[str, Any] | None = None,
        session_key: str | None = None,
        name: str | None = None,
    ) -> Session:
        """Create a new session."""
        payload: dict[str, Any] = {}
        if metadata:
            payload["metadata"] = metadata
        if session_key:
            payload["session_key"] = session_key
        if name:
            payload["name"] = name
        data = self._t.post("/v1/sessions", json=payload)
        return Session.model_validate(data)

    def get_by_key(self, session_key: str) -> SessionDetail:
        """Get a session using a stable caller-provided session key."""
        data = self._t.get(f"/v1/sessions/by-key/{session_key}")
        return SessionDetail.model_validate(data)

    def get(self, session_id: str) -> SessionDetail:
        """Get a session with its messages."""
        data = self._t.get(f"/v1/sessions/{session_id}")
        return SessionDetail.model_validate(data)

    def delete(self, session_id: str) -> None:
        """Delete a session and its messages."""
        self._t.delete(f"/v1/sessions/{session_id}")

    def messages(
        self,
        session_id: str,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Message]:
        """Get messages for a session."""
        data = self._t.get(
            f"/v1/sessions/{session_id}/messages",
            params={"limit": limit, "offset": offset},
        )
        return [Message.model_validate(m) for m in data["messages"]]
