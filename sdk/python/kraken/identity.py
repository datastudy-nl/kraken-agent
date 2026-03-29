"""Identity management operations (SOUL.md, user model, AGENTS.md, identity links)."""

from __future__ import annotations

from kraken._transport import Transport
from kraken.models import AgentsMd, IdentityLink, Soul, UserModel


class Identity:
    """Manage the agent's identity (SOUL.md), user model, AGENTS.md, and identity links."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def get_soul(self) -> Soul:
        """Get the current SOUL.md content."""
        data = self._t.get("/v1/identity/soul")
        return Soul.model_validate(data)

    def set_soul(self, content: str) -> Soul:
        """Update the SOUL.md content (agent personality)."""
        data = self._t.put("/v1/identity/soul", json={"content": content})
        return Soul.model_validate(data)

    def get_user_model(self) -> UserModel:
        """Get the auto-maintained user model."""
        data = self._t.get("/v1/identity/user-model")
        return UserModel.model_validate(data)

    def get_agents_md(self) -> AgentsMd:
        """Get the AGENTS.md project context."""
        data = self._t.get("/v1/identity/agents-md")
        return AgentsMd.model_validate(data)

    def set_agents_md(self, content: str) -> AgentsMd:
        """Update the AGENTS.md project context."""
        data = self._t.put("/v1/identity/agents-md", json={"content": content})
        return AgentsMd.model_validate(data)

    def link_identity(
        self,
        canonical_user_id: str,
        provider: str,
        provider_user_id: str,
        display_name: str | None = None,
    ) -> IdentityLink:
        """Link a platform identity to a canonical user ID."""
        payload: dict = {
            "canonical_user_id": canonical_user_id,
            "provider": provider,
            "provider_user_id": provider_user_id,
        }
        if display_name is not None:
            payload["display_name"] = display_name
        data = self._t.post("/v1/identity/links", json=payload)
        return IdentityLink.model_validate(data)

    def list_identity_links(
        self, canonical_user_id: str | None = None
    ) -> list[IdentityLink]:
        """List identity links, optionally filtered by canonical user ID."""
        params = {}
        if canonical_user_id:
            params["canonical_user_id"] = canonical_user_id
        data = self._t.get("/v1/identity/links", params=params)
        return [IdentityLink.model_validate(link) for link in data.get("links", [])]
