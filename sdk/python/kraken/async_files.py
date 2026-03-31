"""Async workspace file operations."""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any
from urllib.parse import quote

from kraken._transport import AsyncTransport
from kraken.models import FileEntry, FileWriteResult


class AsyncFiles:
    """Manage files in a session's sandbox workspace (async)."""

    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def list(self, session_id: str, *, dir: str | None = None) -> list[FileEntry]:
        """List files in the workspace directory."""
        params: dict[str, Any] = {}
        if dir:
            params["dir"] = dir
        data = await self._t.get(
            f"/v1/sessions/{session_id}/workspace", params=params or None
        )
        return [FileEntry.model_validate(f) for f in data["files"]]

    async def read(self, session_id: str, path: str) -> str:
        """Read a text file from the workspace."""
        encoded_path = quote(path, safe="/")
        data = await self._t.get(
            f"/v1/sessions/{session_id}/workspace/{encoded_path}"
        )
        return data["content"]

    async def read_bytes(self, session_id: str, path: str) -> bytes:
        """Read a binary file from the workspace."""
        encoded_path = quote(path, safe="/")
        data = await self._t.get(
            f"/v1/sessions/{session_id}/workspace/{encoded_path}",
            params={"encoding": "base64"},
        )
        return base64.b64decode(data["content"])

    async def write(
        self, session_id: str, path: str, content: str
    ) -> FileWriteResult:
        """Write a text file to the workspace."""
        encoded_path = quote(path, safe="/")
        data = await self._t.put(
            f"/v1/sessions/{session_id}/workspace/{encoded_path}",
            json={"content": content},
        )
        return FileWriteResult.model_validate(data)

    async def write_bytes(
        self, session_id: str, path: str, data: bytes
    ) -> FileWriteResult:
        """Write a binary file to the workspace."""
        encoded_path = quote(path, safe="/")
        b64 = base64.b64encode(data).decode("ascii")
        resp = await self._t.put(
            f"/v1/sessions/{session_id}/workspace/{encoded_path}",
            json={"content": b64, "encoding": "base64"},
        )
        return FileWriteResult.model_validate(resp)

    async def upload(
        self, session_id: str, local_path: str | Path, remote_path: str | None = None
    ) -> FileWriteResult:
        """Upload a local file to the workspace."""
        local = Path(local_path)
        dest = remote_path or local.name
        file_bytes = local.read_bytes()
        return await self.write_bytes(session_id, dest, file_bytes)

    async def download(
        self, session_id: str, remote_path: str, local_path: str | Path
    ) -> Path:
        """Download a file from the workspace to a local path."""
        content = await self.read_bytes(session_id, remote_path)
        dest = Path(local_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        return dest
