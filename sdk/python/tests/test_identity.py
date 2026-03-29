"""Tests for Identity sub-client."""

import json

import httpx
import pytest
import respx

from kraken._transport import Transport
from kraken.identity import Identity
from kraken.models import AgentsMd, IdentityLink, Soul, UserModel

BASE = "http://localhost:8080"


@pytest.fixture
def identity():
    transport = Transport(BASE, api_key="sk-test")
    return Identity(transport)


@respx.mock
class TestSoul:
    def test_get_soul(self, identity):
        respx.get(f"{BASE}/v1/identity/soul").mock(
            return_value=httpx.Response(200, json={
                "content": "I am a helpful agent.",
            })
        )
        result = identity.get_soul()
        assert isinstance(result, Soul)
        assert result.content == "I am a helpful agent."

    def test_set_soul(self, identity):
        route = respx.put(f"{BASE}/v1/identity/soul").mock(
            return_value=httpx.Response(200, json={
                "content": "New personality.",
            })
        )
        result = identity.set_soul("New personality.")
        body = json.loads(route.calls.last.request.content)
        assert body["content"] == "New personality."
        assert isinstance(result, Soul)


@respx.mock
class TestUserModel:
    def test_get_user_model(self, identity):
        respx.get(f"{BASE}/v1/identity/user-model").mock(
            return_value=httpx.Response(200, json={
                "content": "User prefers formal tone.",
            })
        )
        result = identity.get_user_model()
        assert isinstance(result, UserModel)


@respx.mock
class TestAgentsMd:
    def test_get_agents_md(self, identity):
        respx.get(f"{BASE}/v1/identity/agents-md").mock(
            return_value=httpx.Response(200, json={
                "content": "# Project context",
            })
        )
        result = identity.get_agents_md()
        assert isinstance(result, AgentsMd)

    def test_set_agents_md(self, identity):
        route = respx.put(f"{BASE}/v1/identity/agents-md").mock(
            return_value=httpx.Response(200, json={
                "content": "# Updated",
            })
        )
        result = identity.set_agents_md("# Updated")
        body = json.loads(route.calls.last.request.content)
        assert body["content"] == "# Updated"
        assert isinstance(result, AgentsMd)


@respx.mock
class TestIdentityLinks:
    def test_link_identity(self, identity):
        route = respx.post(f"{BASE}/v1/identity/links").mock(
            return_value=httpx.Response(200, json={
                "id": "il-1",
                "canonical_user_id": "u-1",
                "provider": "discord",
                "provider_user_id": "12345",
                "display_name": "Alice",
            })
        )
        result = identity.link_identity("u-1", "discord", "12345", display_name="Alice")
        assert isinstance(result, IdentityLink)
        body = json.loads(route.calls.last.request.content)
        assert body["canonical_user_id"] == "u-1"
        assert body["provider"] == "discord"
        assert body["display_name"] == "Alice"

    def test_link_identity_without_display_name(self, identity):
        route = respx.post(f"{BASE}/v1/identity/links").mock(
            return_value=httpx.Response(200, json={
                "id": "il-1",
                "canonical_user_id": "u-1",
                "provider": "slack",
                "provider_user_id": "67890",
            })
        )
        identity.link_identity("u-1", "slack", "67890")
        body = json.loads(route.calls.last.request.content)
        assert "display_name" not in body

    def test_list_identity_links(self, identity):
        respx.get(f"{BASE}/v1/identity/links").mock(
            return_value=httpx.Response(200, json={
                "links": [
                    {
                        "id": "il-1",
                        "canonical_user_id": "u-1",
                        "provider": "discord",
                        "provider_user_id": "12345",
                    },
                ]
            })
        )
        result = identity.list_identity_links()
        assert len(result) == 1
        assert isinstance(result[0], IdentityLink)

    def test_list_identity_links_filtered(self, identity):
        route = respx.get(f"{BASE}/v1/identity/links").mock(
            return_value=httpx.Response(200, json={"links": []})
        )
        identity.list_identity_links(canonical_user_id="u-1")
        assert "canonical_user_id=u-1" in str(route.calls.last.request.url)
