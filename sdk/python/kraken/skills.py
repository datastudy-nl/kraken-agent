"""Skills management operations."""

from __future__ import annotations

from typing import Any

from kraken._transport import Transport
from kraken.models import Skill


class Skills:
    """Manage the agent's skill library (procedural memory)."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def list(self, *, tag: str | None = None, search: str | None = None) -> list[Skill]:
        """List all skills, optionally filtered by tag or search term."""
        params: dict[str, Any] = {}
        if tag:
            params["tag"] = tag
        if search:
            params["search"] = search
        data = self._t.get("/v1/skills", params=params)
        return [Skill.model_validate(s) for s in data["skills"]]

    def create(
        self,
        name: str,
        content: str,
        *,
        tags: list[str] | None = None,
    ) -> Skill:
        """Create a new skill."""
        payload: dict[str, Any] = {"name": name, "content": content}
        if tags:
            payload["tags"] = tags
        data = self._t.post("/v1/skills", json=payload)
        return Skill.model_validate(data)

    def get(self, skill_id: str) -> Skill:
        """Get a skill by ID."""
        data = self._t.get(f"/v1/skills/{skill_id}")
        return Skill.model_validate(data)

    def update(
        self,
        skill_id: str,
        *,
        content: str | None = None,
        tags: list[str] | None = None,
    ) -> Skill:
        """Update a skill's content or tags."""
        payload: dict[str, Any] = {}
        if content is not None:
            payload["content"] = content
        if tags is not None:
            payload["tags"] = tags
        data = self._t.patch(f"/v1/skills/{skill_id}", json=payload)
        return Skill.model_validate(data)

    def delete(self, skill_id: str) -> None:
        """Delete (archive) a skill."""
        self._t.delete(f"/v1/skills/{skill_id}")
