"""Tests for async schedule sub-client."""

import httpx
import pytest
import respx

from kraken.async_client import AsyncKrakenClient
from kraken.async_schedules import AsyncSchedules
from kraken.models import Schedule

NOW_ISO = "2026-03-30T10:00:00Z"


@pytest.fixture
async def async_client():
    client = AsyncKrakenClient(api_url="http://localhost:8080", api_key="sk-test")
    yield client
    await client.close()


@pytest.fixture
def schedule_payload():
    return {
        "id": "sched-1",
        "name": "Daily recap",
        "description": "Summarize yesterday",
        "cron_expression": "0 8 * * *",
        "task_prompt": "Summarize yesterday's activity",
        "origin_session_id": "sess-1",
        "enabled": True,
        "max_runs": 10,
        "run_count": 2,
        "last_run_at": NOW_ISO,
        "next_run_at": NOW_ISO,
        "metadata": {"source": "sdk-test"},
        "created_at": NOW_ISO,
        "updated_at": NOW_ISO,
    }


@pytest.mark.asyncio
async def test_has_schedules_subclient(async_client):
    assert isinstance(async_client.schedules, AsyncSchedules)


@respx.mock
@pytest.mark.asyncio
async def test_list_schedules(async_client, schedule_payload):
    respx.get("http://localhost:8080/v1/schedules").mock(
        return_value=httpx.Response(200, json={"schedules": [schedule_payload]})
    )
    schedules = await async_client.schedules.list(limit=10, offset=5)
    assert len(schedules) == 1
    assert isinstance(schedules[0], Schedule)
    assert schedules[0].name == "Daily recap"


@respx.mock
@pytest.mark.asyncio
async def test_create_schedule(async_client, schedule_payload):
    route = respx.post("http://localhost:8080/v1/schedules").mock(
        return_value=httpx.Response(201, json=schedule_payload)
    )
    created = await async_client.schedules.create(
        "Daily recap",
        "Summarize yesterday's activity",
        "0 8 * * *",
        description="Summarize yesterday",
        origin_session_id="sess-1",
        max_runs=10,
        metadata={"source": "sdk-test"},
    )
    assert isinstance(created, Schedule)
    assert created.id == "sched-1"
    body = route.calls.last.request.content
    assert b'"cron_expression":"0 8 * * *"' in body
    assert b'"origin_session_id":"sess-1"' in body


@respx.mock
@pytest.mark.asyncio
async def test_get_schedule(async_client, schedule_payload):
    respx.get("http://localhost:8080/v1/schedules/sched-1").mock(
        return_value=httpx.Response(200, json=schedule_payload)
    )
    schedule = await async_client.schedules.get("sched-1")
    assert schedule.id == "sched-1"


@respx.mock
@pytest.mark.asyncio
async def test_update_schedule(async_client, schedule_payload):
    updated_payload = {**schedule_payload, "enabled": False, "max_runs": 3}
    route = respx.patch("http://localhost:8080/v1/schedules/sched-1").mock(
        return_value=httpx.Response(200, json=updated_payload)
    )
    schedule = await async_client.schedules.update("sched-1", enabled=False, max_runs=3)
    assert schedule.enabled is False
    assert schedule.max_runs == 3
    body = route.calls.last.request.content
    assert b'"enabled":false' in body
    assert b'"max_runs":3' in body


@respx.mock
@pytest.mark.asyncio
async def test_delete_schedule(async_client):
    respx.delete("http://localhost:8080/v1/schedules/sched-1").mock(
        return_value=httpx.Response(200, json={"deleted": True, "id": "sched-1"})
    )
    await async_client.schedules.delete("sched-1")
