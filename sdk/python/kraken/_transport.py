"""HTTP transport layer — thin wrapper around httpx."""

from __future__ import annotations

from typing import Any, Iterator

import httpx


class Transport:
    """Manages HTTP communication with the Kraken API."""

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=timeout,
        )

    # --- Core HTTP methods ---

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    def post(self, path: str, json: dict[str, Any] | None = None) -> Any:
        resp = self._client.post(path, json=json)
        resp.raise_for_status()
        return resp.json()

    def put(self, path: str, json: dict[str, Any] | None = None) -> Any:
        resp = self._client.put(path, json=json)
        resp.raise_for_status()
        return resp.json()

    def patch(self, path: str, json: dict[str, Any] | None = None) -> Any:
        resp = self._client.patch(path, json=json)
        resp.raise_for_status()
        return resp.json()

    def delete(self, path: str) -> Any:
        resp = self._client.delete(path)
        resp.raise_for_status()
        return resp.json()

    def post_stream(self, path: str, json: dict[str, Any] | None = None) -> Iterator[str]:
        with self._client.stream("POST", path, json=json) as resp:
            resp.raise_for_status()
            for chunk in resp.iter_text():
                if chunk:
                    yield chunk

    def close(self) -> None:
        self._client.close()


class AsyncTransport:
    """Async HTTP transport using httpx.AsyncClient."""

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=timeout,
        )

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = await self._client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    async def post(self, path: str, json: dict[str, Any] | None = None) -> Any:
        resp = await self._client.post(path, json=json)
        resp.raise_for_status()
        return resp.json()

    async def put(self, path: str, json: dict[str, Any] | None = None) -> Any:
        resp = await self._client.put(path, json=json)
        resp.raise_for_status()
        return resp.json()

    async def patch(self, path: str, json: dict[str, Any] | None = None) -> Any:
        resp = await self._client.patch(path, json=json)
        resp.raise_for_status()
        return resp.json()

    async def delete(self, path: str) -> Any:
        resp = await self._client.delete(path)
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._client.aclose()
