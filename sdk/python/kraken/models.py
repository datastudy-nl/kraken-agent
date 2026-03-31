"""Pydantic models matching the Kraken API schema."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# --- Chat ---
class Attachment(BaseModel):
    path: str
    filename: str = ""
    mime_type: str = "application/octet-stream"
    size_bytes: int = 0


class ChatResponse(BaseModel):
    id: str
    session_id: str
    session_key: str | None = None
    role: str = "assistant"
    content: str
    model: str
    tool_calls: list[ToolCall] = Field(default_factory=list)
    attachments: list[Attachment] = Field(default_factory=list)
    usage: Usage = Field(default_factory=lambda: Usage())
    created_at: datetime


class ToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0


# --- Sessions ---
class Session(BaseModel):
    id: str
    session_key: str | None = None
    name: str | None = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class Message(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    timestamp: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class SessionDetail(Session):
    messages: list[Message] = Field(default_factory=list)


# --- Memory ---
class Entity(BaseModel):
    id: str
    name: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class Relationship(BaseModel):
    id: str
    source: str
    target: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class Community(BaseModel):
    id: str
    name: str
    summary: str
    level: int
    entity_ids: list[str] = Field(default_factory=list)


class MemoryQueryResult(BaseModel):
    query: str
    mode: str
    results: list[dict[str, Any]] = Field(default_factory=list)
    entities: list[Entity] = Field(default_factory=list)
    communities: list[Community] = Field(default_factory=list)


class GraphView(BaseModel):
    nodes: list[Entity] = Field(default_factory=list)
    edges: list[Relationship] = Field(default_factory=list)
    depth: int
    center: str | None = None


# --- Skills ---
class Skill(BaseModel):
    id: str
    name: str
    content: str
    tags: list[str] = Field(default_factory=list)
    version: int = 1
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Tool(BaseModel):
    id: str
    name: str
    description: str
    instructions: str
    input_schema: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


# --- Identity ---
class Soul(BaseModel):
    content: str
    updated_at: datetime


class UserModel(BaseModel):
    content: str
    updated_at: datetime


class AgentsMd(BaseModel):
    content: str
    updated_at: datetime


class IdentityLink(BaseModel):
    id: str
    canonical_user_id: str
    provider: str
    provider_user_id: str
    display_name: str | None = None


# --- Health ---
class HealthStatus(BaseModel):
    status: str
    version: str
    uptime: float


class Schedule(BaseModel):
    id: str
    name: str
    description: str | None = None
    cron_expression: str
    task_prompt: str
    origin_session_id: str | None = None
    enabled: bool = True
    max_runs: int | None = None
    run_count: int = 0
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


# --- Files / Workspace ---
class FileEntry(BaseModel):
    name: str
    type: str  # "file" or "directory"
    size: int


class FileContent(BaseModel):
    session_id: str
    path: str
    content: str
    encoding: str | None = None
    size: int


class FileWriteResult(BaseModel):
    session_id: str
    path: str
    size: int
