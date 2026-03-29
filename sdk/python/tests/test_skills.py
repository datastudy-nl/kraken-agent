"""Tests for Skills sub-client."""

import json

import httpx
import pytest
import respx

from kraken._transport import Transport
from kraken.models import Skill
from kraken.skills import Skills


@pytest.fixture
def skills():
    transport = Transport("http://localhost:8080", api_key="sk-test")
    return Skills(transport)


NOW_ISO = "2026-03-29T10:00:00Z"
SKILL_JSON = {
    "id": "sk-1",
    "name": "deploy",
    "content": "Run deploy.sh",
    "tags": ["ops"],
    "created_at": NOW_ISO,
    "updated_at": NOW_ISO,
}


@respx.mock
class TestSkillsList:
    def test_list(self, skills):
        respx.get("http://localhost:8080/v1/skills").mock(
            return_value=httpx.Response(200, json={"skills": [SKILL_JSON]})
        )
        result = skills.list()
        assert len(result) == 1
        assert isinstance(result[0], Skill)

    def test_list_with_tag(self, skills):
        route = respx.get("http://localhost:8080/v1/skills").mock(
            return_value=httpx.Response(200, json={"skills": []})
        )
        skills.list(tag="ops")
        assert "tag=ops" in str(route.calls.last.request.url)

    def test_list_with_search(self, skills):
        route = respx.get("http://localhost:8080/v1/skills").mock(
            return_value=httpx.Response(200, json={"skills": []})
        )
        skills.list(search="deploy")
        assert "search=deploy" in str(route.calls.last.request.url)


@respx.mock
class TestSkillsCreate:
    def test_create_minimal(self, skills):
        respx.post("http://localhost:8080/v1/skills").mock(
            return_value=httpx.Response(200, json=SKILL_JSON)
        )
        result = skills.create("deploy", "Run deploy.sh")
        assert isinstance(result, Skill)
        assert result.name == "deploy"

    def test_create_with_tags(self, skills):
        route = respx.post("http://localhost:8080/v1/skills").mock(
            return_value=httpx.Response(200, json=SKILL_JSON)
        )
        skills.create("deploy", "Run deploy.sh", tags=["ops", "ci"])
        body = json.loads(route.calls.last.request.content)
        assert body["tags"] == ["ops", "ci"]


@respx.mock
class TestSkillsGet:
    def test_get(self, skills):
        respx.get("http://localhost:8080/v1/skills/sk-1").mock(
            return_value=httpx.Response(200, json=SKILL_JSON)
        )
        result = skills.get("sk-1")
        assert isinstance(result, Skill)
        assert result.id == "sk-1"


@respx.mock
class TestSkillsUpdate:
    def test_update_content(self, skills):
        route = respx.patch("http://localhost:8080/v1/skills/sk-1").mock(
            return_value=httpx.Response(200, json={**SKILL_JSON, "content": "new"})
        )
        result = skills.update("sk-1", content="new")
        body = json.loads(route.calls.last.request.content)
        assert body["content"] == "new"
        assert isinstance(result, Skill)

    def test_update_tags(self, skills):
        route = respx.patch("http://localhost:8080/v1/skills/sk-1").mock(
            return_value=httpx.Response(200, json={**SKILL_JSON, "tags": ["ci"]})
        )
        skills.update("sk-1", tags=["ci"])
        body = json.loads(route.calls.last.request.content)
        assert body["tags"] == ["ci"]


@respx.mock
class TestSkillsDelete:
    def test_delete(self, skills):
        respx.delete("http://localhost:8080/v1/skills/sk-1").mock(
            return_value=httpx.Response(200, json={"deleted": True})
        )
        skills.delete("sk-1")  # Should not raise
