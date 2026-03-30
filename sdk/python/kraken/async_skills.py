"""Async skills management operations."""

from __future__ import annotations

from typing import Any, List  # noqa: UP035

from kraken._transport import AsyncTransport
from kraken.models import Skill


class AsyncSkills:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def list(
        self, *, tag: str | None = None, search: str | None = None
    ) -> list[Skill]:
        params: dict[str, Any] = {}
        if tag:
            params["tag"] = tag
        if search:
            params["search"] = search
        data = await self._t.get("/v1/skills", params=params)
        return [Skill.model_validate(s) for s in data["skills"]]

    async def create(
        self,
        name: str,
        content: str,
        *,
        tags: List[str] | None = None,  # noqa: UP006
    ) -> Skill:
        payload: dict[str, Any] = {"name": name, "content": content}
        if tags:
            payload["tags"] = tags
        data = await self._t.post("/v1/skills", json=payload)
        return Skill.model_validate(data)

    async def get(self, skill_id: str) -> Skill:
        data = await self._t.get(f"/v1/skills/{skill_id}")
        return Skill.model_validate(data)

    async def update(
        self,
        skill_id: str,
        *,
        content: str | None = None,
        tags: List[str] | None = None,  # noqa: UP006
    ) -> Skill:
        payload: dict[str, Any] = {}
        if content is not None:
            payload["content"] = content
        if tags is not None:
            payload["tags"] = tags
        data = await self._t.patch(f"/v1/skills/{skill_id}", json=payload)
        return Skill.model_validate(data)

    async def delete(self, skill_id: str) -> None:
        await self._t.delete(f"/v1/skills/{skill_id}")
