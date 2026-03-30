"""Tests for schedule sub-client."""

import httpx
import pytest
import respx

from kraken.client import KrakenClient
from kraken.models import Schedule
from kraken.schedules import Schedules

NOW_ISO = "2026-03-30T10:00:00Z"


@pytest.fixture
def client():
    c = KrakenClient(api_url="http://localhost:8080", api_key="sk-test")
    yield c
    c.close()


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


def test_has_schedules_subclient(client):
    assert isinstance(client.schedules, Schedules)


@respx.mock
def test_list_schedules(client, schedule_payload):
    respx.get("http://localhost:8080/v1/schedules").mock(
        return_value=httpx.Response(200, json={"schedules": [schedule_payload]})
    )
    schedules = client.schedules.list(limit=10, offset=5)
    assert len(schedules) == 1
    assert isinstance(schedules[0], Schedule)
    assert schedules[0].name == "Daily recap"


@respx.mock
def test_create_schedule(client, schedule_payload):
    route = respx.post("http://localhost:8080/v1/schedules").mock(
        return_value=httpx.Response(201, json=schedule_payload)
    )
    created = client.schedules.create(
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
def test_get_schedule(client, schedule_payload):
    respx.get("http://localhost:8080/v1/schedules/sched-1").mock(
        return_value=httpx.Response(200, json=schedule_payload)
    )
    schedule = client.schedules.get("sched-1")
    assert schedule.id == "sched-1"


@respx.mock
def test_update_schedule(client, schedule_payload):
    updated_payload = {**schedule_payload, "enabled": False, "max_runs": 3}
    route = respx.patch("http://localhost:8080/v1/schedules/sched-1").mock(
        return_value=httpx.Response(200, json=updated_payload)
    )
    schedule = client.schedules.update("sched-1", enabled=False, max_runs=3)
    assert schedule.enabled is False
    assert schedule.max_runs == 3
    body = route.calls.last.request.content
    assert b'"enabled":false' in body
    assert b'"max_runs":3' in body


@respx.mock
def test_delete_schedule(client):
    respx.delete("http://localhost:8080/v1/schedules/sched-1").mock(
        return_value=httpx.Response(200, json={"deleted": True, "id": "sched-1"})
    )
    client.schedules.delete("sched-1")
