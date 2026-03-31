"""Workspace file operations."""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any
from urllib.parse import quote

from kraken._transport import Transport
from kraken.models import FileEntry, FileWriteResult


class Files:
    """Manage files in a session's sandbox workspace."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def list(self, session_id: str, *, dir: str | None = None) -> list[FileEntry]:
        """List files in the workspace directory.

        Args:
            session_id: The session whose workspace to list.
            dir: Optional subdirectory path.

        Returns:
            List of file entries with name, type, and size.
        """
        params: dict[str, Any] = {}
        if dir:
            params["dir"] = dir
        data = self._t.get(f"/v1/sessions/{session_id}/workspace", params=params or None)
        return [FileEntry.model_validate(f) for f in data["files"]]

    def read(self, session_id: str, path: str) -> str:
        """Read a text file from the workspace.

        Args:
            session_id: The session whose workspace to read from.
            path: Relative file path inside the workspace.

        Returns:
            The file content as a string.
        """
        encoded_path = quote(path, safe="/")
        data = self._t.get(f"/v1/sessions/{session_id}/workspace/{encoded_path}")
        return data["content"]

    def read_bytes(self, session_id: str, path: str) -> bytes:
        """Read a binary file from the workspace.

        Args:
            session_id: The session whose workspace to read from.
            path: Relative file path inside the workspace.

        Returns:
            The file content as bytes.
        """
        encoded_path = quote(path, safe="/")
        data = self._t.get(
            f"/v1/sessions/{session_id}/workspace/{encoded_path}",
            params={"encoding": "base64"},
        )
        return base64.b64decode(data["content"])

    def write(self, session_id: str, path: str, content: str) -> FileWriteResult:
        """Write a text file to the workspace.

        Args:
            session_id: The session whose workspace to write to.
            path: Relative file path inside the workspace.
            content: The text content to write.

        Returns:
            Write result with session_id, path, and size.
        """
        encoded_path = quote(path, safe="/")
        data = self._t.put(
            f"/v1/sessions/{session_id}/workspace/{encoded_path}",
            json={"content": content},
        )
        return FileWriteResult.model_validate(data)

    def write_bytes(self, session_id: str, path: str, data: bytes) -> FileWriteResult:
        """Write a binary file to the workspace.

        Args:
            session_id: The session whose workspace to write to.
            path: Relative file path inside the workspace.
            data: The binary content to write.

        Returns:
            Write result with session_id, path, and size.
        """
        encoded_path = quote(path, safe="/")
        b64 = base64.b64encode(data).decode("ascii")
        resp = self._t.put(
            f"/v1/sessions/{session_id}/workspace/{encoded_path}",
            json={"content": b64, "encoding": "base64"},
        )
        return FileWriteResult.model_validate(resp)

    def upload(
        self, session_id: str, local_path: str | Path, remote_path: str | None = None
    ) -> FileWriteResult:
        """Upload a local file to the workspace.

        Args:
            session_id: The session whose workspace to upload to.
            local_path: Path to the local file to upload.
            remote_path: Destination path in the workspace.
                         Defaults to the local file's name.

        Returns:
            Write result with session_id, path, and size.
        """
        local = Path(local_path)
        dest = remote_path or local.name
        file_bytes = local.read_bytes()
        return self.write_bytes(session_id, dest, file_bytes)

    def download(
        self, session_id: str, remote_path: str, local_path: str | Path
    ) -> Path:
        """Download a file from the workspace to a local path.

        Args:
            session_id: The session whose workspace to download from.
            remote_path: File path in the workspace.
            local_path: Local destination path.

        Returns:
            The local path where the file was saved.
        """
        content = self.read_bytes(session_id, remote_path)
        dest = Path(local_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        return dest
