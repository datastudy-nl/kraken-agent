"""Schedule management operations."""

from __future__ import annotations

from typing import Any, List  # noqa: UP035

from kraken._transport import Transport
from kraken.models import Schedule


class Schedules:
    """Manage recurring and one-time scheduled tasks."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def list(self, *, limit: int = 20, offset: int = 0) -> List[Schedule]:  # noqa: UP006
        """List schedules."""
        data = self._t.get("/v1/schedules", params={"limit": limit, "offset": offset})
        return [Schedule.model_validate(s) for s in data.get("schedules", [])]

    def create(
        self,
        name: str,
        task_prompt: str,
        cron_expression: str,
        *,
        description: str | None = None,
        origin_session_id: str | None = None,
        max_runs: int | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Schedule:
        """Create a recurring schedule."""
        payload: dict[str, Any] = {
            "name": name,
            "task_prompt": task_prompt,
            "cron_expression": cron_expression,
        }
        if description is not None:
            payload["description"] = description
        if origin_session_id is not None:
            payload["origin_session_id"] = origin_session_id
        if max_runs is not None:
            payload["max_runs"] = max_runs
        if metadata is not None:
            payload["metadata"] = metadata
        data = self._t.post("/v1/schedules", json=payload)
        return Schedule.model_validate(data)

    def get(self, schedule_id: str) -> Schedule:
        """Get a schedule by ID."""
        data = self._t.get(f"/v1/schedules/{schedule_id}")
        return Schedule.model_validate(data)

    def update(
        self,
        schedule_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        cron_expression: str | None = None,
        task_prompt: str | None = None,
        enabled: bool | None = None,
        max_runs: int | None = None,
    ) -> Schedule:
        """Update a schedule."""
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        if cron_expression is not None:
            payload["cron_expression"] = cron_expression
        if task_prompt is not None:
            payload["task_prompt"] = task_prompt
        if enabled is not None:
            payload["enabled"] = enabled
        if max_runs is not None:
            payload["max_runs"] = max_runs
        data = self._t.patch(f"/v1/schedules/{schedule_id}", json=payload)
        return Schedule.model_validate(data)

    def delete(self, schedule_id: str) -> None:
        """Delete a schedule."""
        self._t.delete(f"/v1/schedules/{schedule_id}")
