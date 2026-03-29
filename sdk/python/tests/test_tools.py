"""Tests for Tools sub-client."""

import json

import httpx
import pytest
import respx

from kraken._transport import Transport
from kraken.models import Tool
from kraken.tools import Tools

BASE = "http://localhost:8080"


@pytest.fixture
def tools():
    transport = Transport(BASE, api_key="sk-test")
    return Tools(transport)


NOW_ISO = "2026-03-29T10:00:00Z"
TOOL_JSON = {
    "id": "t-1",
    "name": "sql_query",
    "description": "Run SQL",
    "instructions": "Execute the query safely.",
    "tags": ["db"],
    "created_at": NOW_ISO,
    "updated_at": NOW_ISO,
}


@respx.mock
class TestToolsList:
    def test_list(self, tools):
        respx.get(f"{BASE}/v1/tools").mock(
            return_value=httpx.Response(200, json={"tools": [TOOL_JSON]})
        )
        result = tools.list()
        assert len(result) == 1
        assert isinstance(result[0], Tool)

    def test_list_with_filters(self, tools):
        route = respx.get(f"{BASE}/v1/tools").mock(
            return_value=httpx.Response(200, json={"tools": []})
        )
        tools.list(tag="db", search="sql", limit=10)
        url = str(route.calls.last.request.url)
        assert "tag=db" in url
        assert "search=sql" in url
        assert "limit=10" in url


@respx.mock
class TestToolsCreate:
    def test_create_minimal(self, tools):
        route = respx.post(f"{BASE}/v1/tools").mock(
            return_value=httpx.Response(200, json=TOOL_JSON)
        )
        result = tools.create("sql_query", "Run SQL", "Execute the query safely.")
        assert isinstance(result, Tool)
        body = json.loads(route.calls.last.request.content)
        assert body["name"] == "sql_query"
        assert "input_schema" not in body
        assert "tags" not in body

    def test_create_with_schema_and_tags(self, tools):
        schema = {"type": "object", "properties": {"query": {"type": "string"}}}
        route = respx.post(f"{BASE}/v1/tools").mock(
            return_value=httpx.Response(200, json={**TOOL_JSON, "input_schema": schema})
        )
        tools.create("sql_query", "Run SQL", "Execute.", input_schema=schema, tags=["db"])
        body = json.loads(route.calls.last.request.content)
        assert body["input_schema"] == schema
        assert body["tags"] == ["db"]


@respx.mock
class TestToolsGet:
    def test_get(self, tools):
        respx.get(f"{BASE}/v1/tools/t-1").mock(
            return_value=httpx.Response(200, json=TOOL_JSON)
        )
        result = tools.get("t-1")
        assert isinstance(result, Tool)
        assert result.id == "t-1"


@respx.mock
class TestToolsUpdate:
    def test_update_name(self, tools):
        route = respx.patch(f"{BASE}/v1/tools/t-1").mock(
            return_value=httpx.Response(200, json={**TOOL_JSON, "name": "pg_query"})
        )
        tools.update("t-1", name="pg_query")
        body = json.loads(route.calls.last.request.content)
        assert body["name"] == "pg_query"

    def test_update_partial_fields(self, tools):
        route = respx.patch(f"{BASE}/v1/tools/t-1").mock(
            return_value=httpx.Response(200, json=TOOL_JSON)
        )
        tools.update("t-1", description="Updated desc", tags=["new"])
        body = json.loads(route.calls.last.request.content)
        assert body["description"] == "Updated desc"
        assert body["tags"] == ["new"]
        # Fields not passed should be absent
        assert "name" not in body
        assert "instructions" not in body


@respx.mock
class TestToolsDelete:
    def test_delete(self, tools):
        respx.delete(f"{BASE}/v1/tools/t-1").mock(
            return_value=httpx.Response(200, json={"deleted": True})
        )
        tools.delete("t-1")  # Should not raise
