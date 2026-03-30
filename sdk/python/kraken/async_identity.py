"""Async identity management operations."""

from __future__ import annotations

from typing import Any

from kraken._transport import AsyncTransport
from kraken.models import AgentsMd, IdentityLink, Soul, UserModel


class AsyncIdentity:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def get_soul(self) -> Soul:
        data = await self._t.get("/v1/identity/soul")
        return Soul.model_validate(data)

    async def set_soul(self, content: str) -> Soul:
        data = await self._t.put("/v1/identity/soul", json={"content": content})
        return Soul.model_validate(data)

    async def get_user_model(self) -> UserModel:
        data = await self._t.get("/v1/identity/user-model")
        return UserModel.model_validate(data)

    async def get_agents_md(self) -> AgentsMd:
        data = await self._t.get("/v1/identity/agents-md")
        return AgentsMd.model_validate(data)

    async def set_agents_md(self, content: str) -> AgentsMd:
        data = await self._t.put("/v1/identity/agents-md", json={"content": content})
        return AgentsMd.model_validate(data)

    async def link_identity(
        self,
        canonical_user_id: str,
        provider: str,
        provider_user_id: str,
        display_name: str | None = None,
    ) -> IdentityLink:
        payload: dict[str, Any] = {
            "canonical_user_id": canonical_user_id,
            "provider": provider,
            "provider_user_id": provider_user_id,
        }
        if display_name is not None:
            payload["display_name"] = display_name
        data = await self._t.post("/v1/identity/links", json=payload)
        return IdentityLink.model_validate(data)

    async def list_identity_links(
        self, canonical_user_id: str | None = None
    ) -> list[IdentityLink]:
        params: dict[str, str] = {}
        if canonical_user_id:
            params["canonical_user_id"] = canonical_user_id
        data = await self._t.get("/v1/identity/links", params=params)
        return [IdentityLink.model_validate(link) for link in data.get("links", [])]
