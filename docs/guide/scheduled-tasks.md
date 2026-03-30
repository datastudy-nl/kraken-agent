---
layout: layouts/docs.njk
title: Scheduled Tasks
description: Cron-based task scheduling with full agent capabilities
---

# Scheduled Tasks

Kraken can run tasks on a cron schedule — no external scheduler needed. Scheduled tasks execute as new conversations, with full access to the knowledge graph, skills, and tools.

## Creating a Schedule

<div class="tabs">
<div class="tab-buttons">
<button class="tab-button active" data-tab="create-python">Python SDK</button>
<button class="tab-button" data-tab="create-rest">REST API</button>
</div>
<div class="tab-content active" id="create-python">

```python
from kraken import KrakenClient

client = KrakenClient(api_url="http://localhost:8080")

client.sessions.create(session_key="schedules")  # optional: context session

schedule = client.chat(
    "Create a schedule called 'daily-standup' that runs every weekday at 9am. "
    "It should summarize what I worked on yesterday.",
    session_key="schedules",
)
```

Or use the schedules API directly:

```python
# Direct API — no chat needed
import httpx

httpx.post(
    "http://localhost:8080/v1/schedules",
    headers={"Authorization": "Bearer sk-..."},
    json={
        "name": "daily-standup",
        "cron_expression": "0 9 * * 1-5",
        "task_prompt": "Summarize what I worked on yesterday and list priorities for today.",
        "metadata": {"channel": "slack-standup"},
    },
)
```

</div>
<div class="tab-content" id="create-rest">

```bash
curl -X POST http://localhost:8080/v1/schedules \
  -H "Authorization: Bearer $KRAKEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "daily-standup",
    "cron_expression": "0 9 * * 1-5",
    "task_prompt": "Summarize what I worked on yesterday and list priorities for today.",
    "max_runs": 260
  }'
```

</div>
</div>

---

## Cron Expressions

Standard 5-field cron format:

```
┌───────────── minute (0–59)
│ ┌───────────── hour (0–23)
│ │ ┌───────────── day of month (1–31)
│ │ │ ┌───────────── month (1–12)
│ │ │ │ ┌───────────── day of week (0–7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

### Common patterns

| Expression | Schedule |
|-----------|----------|
| `0 9 * * 1-5` | Every weekday at 9:00 AM |
| `0 */4 * * *` | Every 4 hours |
| `30 8 * * 1` | Every Monday at 8:30 AM |
| `0 0 1 * *` | First day of every month at midnight |
| `*/15 * * * *` | Every 15 minutes |
| `0 18 * * 5` | Every Friday at 6:00 PM |

---

## How Schedules Execute

When a schedule fires:

1. The worker creates a new session with the schedule's `task_prompt` as the message
2. If `origin_session_id` was set, the new session inherits context from that session
3. The agent processes the task with full access to:
   - Knowledge graph (all entities, relationships, communities)
   - Skills (relevant procedures loaded by similarity)
   - Tools (browser, code execution, etc.)
   - User model
4. The response is stored in the new session
5. The schedule's `run_count` increments
6. If `max_runs` is reached, the schedule is disabled

---

## Practical Examples

### Weekly Project Summary

```json
{
  "name": "weekly-summary",
  "cron_expression": "0 17 * * 5",
  "task_prompt": "Generate a weekly summary: what entities were added to my knowledge graph this week, what skills were created or updated, and what are the key themes across my conversations?"
}
```

### Daily Learning Digest

```json
{
  "name": "learning-digest",
  "cron_expression": "0 8 * * *",
  "task_prompt": "Review my recent conversations and identify: (1) new technical concepts I discussed, (2) questions I asked that I might want to revisit, (3) any action items I mentioned but might not have completed."
}
```

### Automated Research

```json
{
  "name": "tech-radar",
  "cron_expression": "0 10 * * 1",
  "task_prompt": "Use the browser to check the latest releases of the tools and frameworks in my knowledge graph. Summarize any notable updates or breaking changes."
}
```

### Knowledge Graph Maintenance

```json
{
  "name": "graph-cleanup",
  "cron_expression": "0 3 * * 0",
  "task_prompt": "Review the knowledge graph for inconsistencies: duplicate entities with different names, stale relationships, or entities that should be merged. List suggested cleanups."
}
```

---

## Managing Schedules

### List all schedules

```bash
curl http://localhost:8080/v1/schedules \
  -H "Authorization: Bearer $KRAKEN_API_KEY"
```

### Update a schedule

```bash
curl -X PATCH http://localhost:8080/v1/schedules/{id} \
  -H "Authorization: Bearer $KRAKEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false
  }'
```

### Delete a schedule

```bash
curl -X DELETE http://localhost:8080/v1/schedules/{id} \
  -H "Authorization: Bearer $KRAKEN_API_KEY"
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `KRAKEN_DREAM_CRON` | `*/15 * * * *` | How often the dream cycle runs (also controls schedule tick) |

The schedule executor runs as part of the worker process. It checks for due schedules every minute.

---

## Delivery Platforms

Schedule results are stored in sessions. To deliver results to external platforms (Discord, Slack, email), you have two options:

### Option 1: Webhook integration

Create a tool that posts to your platform, then reference it in the task prompt:

```json
{
  "name": "slack-standup",
  "cron_expression": "0 9 * * 1-5",
  "task_prompt": "Summarize yesterday's work and post it using the send-to-slack tool in the #standup channel."
}
```

### Option 2: Poll from your integration

Your Discord bot or Slack app can poll Kraken for schedule results:

```python
# In your Discord bot, check for new schedule outputs
sessions = kraken.sessions.list(limit=5)
for session in sessions:
    if session.metadata.get("schedule_name") == "daily-standup":
        # Forward to Discord channel
        ...
```
