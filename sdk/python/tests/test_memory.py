"""Tests for Memory sub-client."""

import httpx
import pytest
import respx

from kraken._transport import Transport
from kraken.memory import Memory
from kraken.models import Entity, GraphView, MemoryQueryResult, Relationship


@pytest.fixture
def memory():
    transport = Transport("http://localhost:8080", api_key="sk-test")
    return Memory(transport)


@respx.mock
class TestMemoryQuery:
    def test_basic_query(self, memory):
        respx.post("http://localhost:8080/v1/memory/query").mock(
            return_value=httpx.Response(200, json={
                "answer": "The answer is 42.",
                "sources": [],
            })
        )
        result = memory.query("What is the meaning?")
        assert isinstance(result, MemoryQueryResult)
        assert result.answer == "The answer is 42."

    def test_query_with_mode_and_limit(self, memory):
        route = respx.post("http://localhost:8080/v1/memory/query").mock(
            return_value=httpx.Response(200, json={"answer": "", "sources": []})
        )
        memory.query("test", mode="local", limit=5)
        import json
        body = json.loads(route.calls.last.request.content)
        assert body["mode"] == "local"
        assert body["limit"] == 5

    def test_query_with_time_range(self, memory):
        route = respx.post("http://localhost:8080/v1/memory/query").mock(
            return_value=httpx.Response(200, json={"answer": "", "sources": []})
        )
        memory.query("test", time_start="2025-01-01", time_end="2025-12-31")
        import json
        body = json.loads(route.calls.last.request.content)
        assert body["time_range"]["start"] == "2025-01-01"
        assert body["time_range"]["end"] == "2025-12-31"

    def test_query_with_entity_filter(self, memory):
        route = respx.post("http://localhost:8080/v1/memory/query").mock(
            return_value=httpx.Response(200, json={"answer": "", "sources": []})
        )
        memory.query("test", entity_filter=["e-1", "e-2"])
        import json
        body = json.loads(route.calls.last.request.content)
        assert body["entity_filter"] == ["e-1", "e-2"]


@respx.mock
class TestMemoryEntities:
    def test_list_entities(self, memory):
        respx.get("http://localhost:8080/v1/memory/entities").mock(
            return_value=httpx.Response(200, json={
                "entities": [
                    {"id": "e-1", "name": "Alice", "type": "person"},
                    {"id": "e-2", "name": "Bob", "type": "person"},
                ]
            })
        )
        result = memory.list_entities()
        assert len(result) == 2
        assert all(isinstance(e, Entity) for e in result)

    def test_list_entities_with_filters(self, memory):
        route = respx.get("http://localhost:8080/v1/memory/entities").mock(
            return_value=httpx.Response(200, json={"entities": []})
        )
        memory.list_entities(type="person", search="alice", limit=10)
        url = str(route.calls.last.request.url)
        assert "type=person" in url
        assert "search=alice" in url
        assert "limit=10" in url

    def test_add_entity(self, memory):
        respx.post("http://localhost:8080/v1/memory/entities").mock(
            return_value=httpx.Response(200, json={
                "id": "e-new", "name": "Carol", "type": "person",
            })
        )
        result = memory.add_entity("Carol", "person")
        assert isinstance(result, Entity)
        assert result.name == "Carol"

    def test_add_entity_with_properties(self, memory):
        route = respx.post("http://localhost:8080/v1/memory/entities").mock(
            return_value=httpx.Response(200, json={
                "id": "e-new", "name": "Server", "type": "system",
                "properties": {"os": "linux"},
            })
        )
        memory.add_entity("Server", "system", properties={"os": "linux"})
        import json
        body = json.loads(route.calls.last.request.content)
        assert body["properties"] == {"os": "linux"}

    def test_delete_entity(self, memory):
        respx.delete("http://localhost:8080/v1/memory/entities/e-1").mock(
            return_value=httpx.Response(200, json={"deleted": True})
        )
        memory.delete_entity("e-1")  # Should not raise


@respx.mock
class TestMemoryRelationships:
    def test_add_relationship(self, memory):
        respx.post("http://localhost:8080/v1/memory/relationships").mock(
            return_value=httpx.Response(200, json={
                "id": "r-1", "source": "e-1", "target": "e-2", "type": "knows",
            })
        )
        result = memory.add_relationship("e-1", "e-2", "knows")
        assert isinstance(result, Relationship)
        assert result.type == "knows"

    def test_add_relationship_with_properties(self, memory):
        route = respx.post("http://localhost:8080/v1/memory/relationships").mock(
            return_value=httpx.Response(200, json={
                "id": "r-1", "source": "e-1", "target": "e-2", "type": "works_with",
            })
        )
        memory.add_relationship("e-1", "e-2", "works_with", properties={"since": "2020"})
        import json
        body = json.loads(route.calls.last.request.content)
        assert body["properties"] == {"since": "2020"}


@respx.mock
class TestMemoryGraph:
    def test_graph_default(self, memory):
        respx.get("http://localhost:8080/v1/memory/graph").mock(
            return_value=httpx.Response(200, json={
                "entities": [], "relationships": [],
            })
        )
        result = memory.graph()
        assert isinstance(result, GraphView)

    def test_graph_with_center_and_depth(self, memory):
        route = respx.get("http://localhost:8080/v1/memory/graph").mock(
            return_value=httpx.Response(200, json={
                "entities": [], "relationships": [],
            })
        )
        memory.graph(center="e-1", depth=3)
        url = str(route.calls.last.request.url)
        assert "center=e-1" in url
        assert "depth=3" in url
