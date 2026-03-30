"""Async tool registry operations."""

from __future__ import annotations

from typing import Any, List  # noqa: UP035

from kraken._transport import AsyncTransport
from kraken.models import Tool


class AsyncTools:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def list(
        self,
        *,
        tag: str | None = None,
        search: str | None = None,
        limit: int = 100,
    ) -> list[Tool]:
        params: dict[str, Any] = {"limit": limit}
        if tag:
            params["tag"] = tag
        if search:
            params["search"] = search
        data = await self._t.get("/v1/tools", params=params)
        return [Tool.model_validate(item) for item in data["tools"]]

    async def create(
        self,
        name: str,
        description: str,
        instructions: str,
        *,
        input_schema: dict[str, Any] | None = None,
        tags: List[str] | None = None,  # noqa: UP006
    ) -> Tool:
        payload: dict[str, Any] = {
            "name": name,
            "description": description,
            "instructions": instructions,
        }
        if input_schema is not None:
            payload["input_schema"] = input_schema
        if tags is not None:
            payload["tags"] = tags
        data = await self._t.post("/v1/tools", json=payload)
        return Tool.model_validate(data)

    async def get(self, tool_id: str) -> Tool:
        data = await self._t.get(f"/v1/tools/{tool_id}")
        return Tool.model_validate(data)

    async def update(
        self,
        tool_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        instructions: str | None = None,
        input_schema: dict[str, Any] | None = None,
        tags: List[str] | None = None,  # noqa: UP006
    ) -> Tool:
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        if instructions is not None:
            payload["instructions"] = instructions
        if input_schema is not None:
            payload["input_schema"] = input_schema
        if tags is not None:
            payload["tags"] = tags
        data = await self._t.patch(f"/v1/tools/{tool_id}", json=payload)
        return Tool.model_validate(data)

    async def delete(self, tool_id: str) -> None:
        await self._t.delete(f"/v1/tools/{tool_id}")
