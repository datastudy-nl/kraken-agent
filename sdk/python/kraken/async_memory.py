"""Async GraphRAG memory operations."""

from __future__ import annotations

from typing import Any, Literal

from kraken._transport import AsyncTransport
from kraken.models import Entity, GraphView, MemoryQueryResult, Relationship

QueryMode = Literal["auto", "local", "global", "drift", "basic"]


class AsyncMemory:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def query(
        self,
        query: str,
        *,
        mode: QueryMode = "auto",
        limit: int = 10,
        time_start: str | None = None,
        time_end: str | None = None,
        entity_filter: list[str] | None = None,
    ) -> MemoryQueryResult:
        payload: dict[str, Any] = {"query": query, "mode": mode, "limit": limit}
        if time_start or time_end:
            payload["time_range"] = {}
            if time_start:
                payload["time_range"]["start"] = time_start
            if time_end:
                payload["time_range"]["end"] = time_end
        if entity_filter:
            payload["entity_filter"] = entity_filter

        data = await self._t.post("/v1/memory/query", json=payload)
        return MemoryQueryResult.model_validate(data)

    async def list_entities(
        self,
        *,
        type: str | None = None,
        search: str | None = None,
        limit: int = 50,
    ) -> list[Entity]:
        params: dict[str, Any] = {"limit": limit}
        if type:
            params["type"] = type
        if search:
            params["search"] = search
        data = await self._t.get("/v1/memory/entities", params=params)
        return [Entity.model_validate(e) for e in data["entities"]]

    async def add_entity(
        self,
        name: str,
        type: str,
        properties: dict[str, Any] | None = None,
    ) -> Entity:
        payload: dict[str, Any] = {"name": name, "type": type}
        if properties:
            payload["properties"] = properties
        data = await self._t.post("/v1/memory/entities", json=payload)
        return Entity.model_validate(data)

    async def delete_entity(self, entity_id: str) -> None:
        await self._t.delete(f"/v1/memory/entities/{entity_id}")

    async def add_relationship(
        self,
        source: str,
        target: str,
        type: str,
        properties: dict[str, Any] | None = None,
    ) -> Relationship:
        payload: dict[str, Any] = {"source": source, "target": target, "type": type}
        if properties:
            payload["properties"] = properties
        data = await self._t.post("/v1/memory/relationships", json=payload)
        return Relationship.model_validate(data)

    async def graph(self, *, center: str | None = None, depth: int = 2) -> GraphView:
        params: dict[str, Any] = {"depth": depth}
        if center:
            params["center"] = center
        data = await self._t.get("/v1/memory/graph", params=params)
        return GraphView.model_validate(data)
