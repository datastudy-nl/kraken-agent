"""Main Kraken client — single entry point for all API operations."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from kraken._transport import Transport
from kraken.identity import Identity
from kraken.memory import Memory
from kraken.models import ChatResponse, HealthStatus
from kraken.sessions import Sessions
from kraken.skills import Skills
from kraken.tools import Tools


class KrakenClient:
    """
    Python client for the Kraken Agent API.

    Usage::

        from kraken import KrakenClient

        client = KrakenClient(
            api_url="http://localhost:8080",
            model="gpt-5.4",
            api_key="sk-...",
        )

        # Simple chat
        response = client.chat("Hello!")
        print(response.content)

        # Session-based chat
        r1 = client.chat("My name is Alice", session_key="discord-12345")
        r2 = client.chat("What's my name?", session_key="discord-12345")

        # Memory
        results = client.memory.query("What do you know about my projects?")

        # Streaming
        for chunk in client.chat("Tell me about GraphRAG", stream=True):
            print(chunk, end="")
    """

    def __init__(
        self,
        api_url: str = "http://localhost:8080",
        model: str | None = None,
        api_key: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        self.api_url = api_url
        self.model = model
        self._transport = Transport(api_url, api_key=api_key, timeout=timeout)

        # Sub-clients for each domain
        self.sessions = Sessions(self._transport)
        self.memory = Memory(self._transport)
        self.skills = Skills(self._transport)
        self.tools = Tools(self._transport)
        self.identity = Identity(self._transport)

    # --- Chat (top-level convenience) ---

    def chat(
        self,
        message: str,
        *,
        session_id: str | None = None,
        session_key: str | None = None,
        session_name: str | None = None,
        model: str | None = None,
        stream: bool = False,
        metadata: dict[str, Any] | None = None,
    ) -> ChatResponse | Iterator[str]:
        """
        Send a message to the agent and get a response.

        Args:
            message: The user message.
            session_id: Optional session ID for conversational context.
            session_key: Stable caller-controlled session key like "discord-12345".
            session_name: Optional human-readable session label.
            model: Override the default LLM model.
            stream: If True, returns an iterator of text chunks.
            metadata: Arbitrary metadata to attach to the message.

        Returns:
            ChatResponse if stream=False, Iterator[str] if stream=True.
        """
        payload: dict[str, Any] = {"message": message, "stream": stream}
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

        if stream:
            return self._transport.post_stream("/v1/chat", json=payload)

        data = self._transport.post("/v1/chat", json=payload)
        return ChatResponse.model_validate(data)

    # --- Health ---

    def health(self) -> HealthStatus:
        """Check API health status."""
        data = self._transport.get("/health")
        return HealthStatus.model_validate(data)

    # --- Lifecycle ---

    def close(self) -> None:
        """Close the HTTP connection."""
        self._transport.close()

    def __enter__(self) -> KrakenClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
