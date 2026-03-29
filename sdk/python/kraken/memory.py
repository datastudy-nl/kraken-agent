"""GraphRAG memory operations."""

from __future__ import annotations

from typing import Any, Literal

from kraken._transport import Transport
from kraken.models import Entity, GraphView, MemoryQueryResult, Relationship

QueryMode = Literal["auto", "local", "global", "drift", "basic"]


class Memory:
    """Query and manage the agent's GraphRAG knowledge graph."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    # --- Query ---

    def query(
        self,
        query: str,
        *,
        mode: QueryMode = "auto",
        limit: int = 10,
        time_start: str | None = None,
        time_end: str | None = None,
        entity_filter: list[str] | None = None,
    ) -> MemoryQueryResult:
        """
        Query the agent's memory using GraphRAG multi-mode search.

        Args:
            query: Natural language question.
            mode: Search strategy — "auto" lets the agent pick.
            limit: Max results.
            time_start: ISO datetime lower bound.
            time_end: ISO datetime upper bound.
            entity_filter: Only search within these entity IDs.
        """
        payload: dict[str, Any] = {"query": query, "mode": mode, "limit": limit}
        if time_start or time_end:
            payload["time_range"] = {}
            if time_start:
                payload["time_range"]["start"] = time_start
            if time_end:
                payload["time_range"]["end"] = time_end
        if entity_filter:
            payload["entity_filter"] = entity_filter

        data = self._t.post("/v1/memory/query", json=payload)
        return MemoryQueryResult.model_validate(data)

    # --- Entities ---

    def list_entities(
        self,
        *,
        type: str | None = None,
        search: str | None = None,
        limit: int = 50,
    ) -> list[Entity]:
        """List entities in the knowledge graph."""
        params: dict[str, Any] = {"limit": limit}
        if type:
            params["type"] = type
        if search:
            params["search"] = search
        data = self._t.get("/v1/memory/entities", params=params)
        return [Entity.model_validate(e) for e in data["entities"]]

    def add_entity(
        self,
        name: str,
        type: str,
        properties: dict[str, Any] | None = None,
    ) -> Entity:
        """Add an entity to the knowledge graph."""
        payload: dict[str, Any] = {"name": name, "type": type}
        if properties:
            payload["properties"] = properties
        data = self._t.post("/v1/memory/entities", json=payload)
        return Entity.model_validate(data)

    def delete_entity(self, entity_id: str) -> None:
        """Remove an entity from the knowledge graph."""
        self._t.delete(f"/v1/memory/entities/{entity_id}")

    # --- Relationships ---

    def add_relationship(
        self,
        source: str,
        target: str,
        type: str,
        properties: dict[str, Any] | None = None,
    ) -> Relationship:
        """Add a relationship between two entities."""
        payload: dict[str, Any] = {"source": source, "target": target, "type": type}
        if properties:
            payload["properties"] = properties
        data = self._t.post("/v1/memory/relationships", json=payload)
        return Relationship.model_validate(data)

    # --- Graph ---

    def graph(self, *, center: str | None = None, depth: int = 2) -> GraphView:
        """Get a subgraph for visualization or traversal."""
        params: dict[str, Any] = {"depth": depth}
        if center:
            params["center"] = center
        data = self._t.get("/v1/memory/graph", params=params)
        return GraphView.model_validate(data)
