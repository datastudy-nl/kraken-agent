"""Tests for Pydantic models — field defaults, validation, and datetime parsing."""

from datetime import datetime, timezone

from kraken.models import (
    AgentsMd,
    ChatResponse,
    Community,
    Entity,
    GraphView,
    HealthStatus,
    IdentityLink,
    MemoryQueryResult,
    Relationship,
    Session,
    SessionDetail,
    Skill,
    Soul,
    Tool,
    ToolCall,
    Usage,
    UserModel,
)


class TestChatResponse:
    def test_minimal(self):
        data = {
            "id": "resp-1",
            "session_id": "sess-1",
            "content": "Hello!",
            "model": "gpt-5.4",
            "created_at": "2026-03-29T10:00:00Z",
        }
        r = ChatResponse.model_validate(data)
        assert r.id == "resp-1"
        assert r.role == "assistant"
        assert r.session_key is None
        assert r.tool_calls == []
        assert r.usage.prompt_tokens == 0
        assert r.usage.completion_tokens == 0

    def test_full(self):
        data = {
            "id": "resp-2",
            "session_id": "sess-1",
            "session_key": "discord-123",
            "role": "assistant",
            "content": "Hi there!",
            "model": "claude-4",
            "tool_calls": [{"name": "web_search", "arguments": {"query": "test"}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "created_at": "2026-03-29T12:00:00Z",
        }
        r = ChatResponse.model_validate(data)
        assert r.session_key == "discord-123"
        assert len(r.tool_calls) == 1
        assert r.tool_calls[0].name == "web_search"
        assert r.usage.prompt_tokens == 100


class TestToolCall:
    def test_defaults(self):
        tc = ToolCall(name="fetch_url")
        assert tc.arguments == {}


class TestUsage:
    def test_defaults(self):
        u = Usage()
        assert u.prompt_tokens == 0
        assert u.completion_tokens == 0


class TestSession:
    def test_defaults(self):
        data = {
            "id": "s-1",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
        s = Session.model_validate(data)
        assert s.session_key is None
        assert s.name is None
        assert s.message_count == 0
        assert s.metadata == {}


class TestSessionDetail:
    def test_inherits_session(self):
        data = {
            "id": "s-2",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "messages": [
                {
                    "id": "m-1",
                    "session_id": "s-2",
                    "role": "user",
                    "content": "Hello",
                    "timestamp": "2026-01-01T00:01:00Z",
                }
            ],
        }
        sd = SessionDetail.model_validate(data)
        assert len(sd.messages) == 1
        assert sd.messages[0].content == "Hello"


class TestEntity:
    def test_defaults(self):
        e = Entity(id="e-1", name="Alice", type="person")
        assert e.properties == {}
        assert e.created_at is None


class TestRelationship:
    def test_defaults(self):
        r = Relationship(id="r-1", source="e-1", target="e-2", type="knows")
        assert r.properties == {}
        assert r.created_at is None


class TestCommunity:
    def test_defaults(self):
        c = Community(id="c-1", name="Team", summary="A team", level=0)
        assert c.entity_ids == []


class TestMemoryQueryResult:
    def test_defaults(self):
        m = MemoryQueryResult(query="test", mode="auto")
        assert m.results == []
        assert m.entities == []
        assert m.communities == []


class TestGraphView:
    def test_defaults(self):
        g = GraphView(depth=2)
        assert g.nodes == []
        assert g.edges == []
        assert g.center is None


class TestSkill:
    def test_defaults(self):
        s = Skill(id="sk-1", name="Test Skill", content="Do stuff")
        assert s.tags == []
        assert s.version == 1
        assert s.created_at is None


class TestTool:
    def test_defaults(self):
        t = Tool(
            id="t-1",
            name="Test Tool",
            description="Does stuff",
            instructions="Run it",
        )
        assert t.input_schema == {}
        assert t.tags == []


class TestIdentityModels:
    def test_soul(self):
        s = Soul(content="I am Kraken", updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
        assert s.content == "I am Kraken"

    def test_user_model(self):
        u = UserModel(
            content="User likes Python",
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert u.content == "User likes Python"

    def test_agents_md(self):
        a = AgentsMd(content="# Project info", updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
        assert a.content == "# Project info"


class TestIdentityLink:
    def test_optional_display_name(self):
        link = IdentityLink(
            id="il-1",
            canonical_user_id="user-1",
            provider="discord",
            provider_user_id="12345",
        )
        assert link.display_name is None


class TestHealthStatus:
    def test_basic(self):
        h = HealthStatus(status="ok", version="0.1.0", uptime=123.45)
        assert h.status == "ok"
        assert h.uptime == 123.45


class TestDatetimeParsing:
    def test_iso_with_z(self):
        s = Session.model_validate({
            "id": "s-1",
            "created_at": "2026-03-29T10:00:00Z",
            "updated_at": "2026-03-29T10:00:00Z",
        })
        assert isinstance(s.created_at, datetime)

    def test_iso_with_offset(self):
        s = Session.model_validate({
            "id": "s-1",
            "created_at": "2026-03-29T10:00:00+02:00",
            "updated_at": "2026-03-29T10:00:00+02:00",
        })
        assert isinstance(s.created_at, datetime)
