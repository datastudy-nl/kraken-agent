---
layout: layouts/docs.njk
title: Browser Automation
description: Headless Chromium for web research, data extraction, and screenshots
---

# Browser Automation

Your personal assistant can browse the web. Kraken includes a headless Chromium browser as a built-in tool, enabling web research, data extraction, form filling, and screenshot capture — all from within a conversation.

## Architecture

```
Kraken API  ──(Playwright CDP)──>  Browserless (Chromium)
```

The browser runs as a separate Docker container ([Browserless](https://www.browserless.io/)), managed by Docker Compose. Kraken connects via the Chrome DevTools Protocol (CDP) using Playwright.

## Configuration

```bash
# Browser connection
BROWSER_WS_ENDPOINT=ws://browserless:3000   # WebSocket endpoint for CDP

# Security
KRAKEN_BROWSER_BLOCKED_HOSTS=               # Additional hosts to block (comma-separated)
```

The browser container is included in the default `docker-compose.yml`:

```yaml
browserless:
  image: ghcr.io/browserless/chromium:latest
  restart: unless-stopped
  environment:
    - MAX_CONCURRENT_SESSIONS=5
    - CONNECTION_TIMEOUT=120000
```

---

## What the Agent Can Do

When the browser tool is available, the agent can:

| Action | Description |
|--------|-------------|
| **Navigate** | Go to any public URL |
| **Extract text** | Get the text content of a page or specific element |
| **Screenshot** | Capture full-page or element screenshots |
| **Click** | Click buttons, links, or any element by selector |
| **Fill forms** | Type into input fields, select dropdowns |
| **Wait** | Wait for elements to appear before interacting |
| **Execute JS** | Run JavaScript in the page context |

### Example conversation

> **You:** Find the latest release of Node.js and tell me what's new.
>
> **Kraken:** I'll check the Node.js releases page.
>
> *[Agent uses browser: navigates to nodejs.org/en/blog, extracts latest release post]*
>
> The latest Node.js release is v22.15.0 (LTS). Key changes include...

The agent decides when to use the browser based on the query. You don't need to explicitly ask it to "use the browser" — if web information is needed, it will browse.

---

## SSRF Protection

Kraken blocks requests to internal/private IP ranges by default. The browser cannot navigate to:

- `127.0.0.0/8` (localhost)
- `10.0.0.0/8` (private class A)
- `172.16.0.0/12` (private class B)
- `192.168.0.0/16` (private class C)
- `169.254.0.0/16` (link-local)
- `::1` (IPv6 loopback)
- `fc00::/7` (IPv6 unique local)

This prevents the agent from being used to probe internal services.

<div class="callout callout-warning">
<p class="callout-title">Additional blocked hosts</p>
<p>You can block additional domains via <code>KRAKEN_BROWSER_BLOCKED_HOSTS</code>:</p>

```bash
KRAKEN_BROWSER_BLOCKED_HOSTS=internal.company.com,admin.local
```
</div>

---

## Using Browser via the API

You don't call browser actions directly — the agent uses the browser tool autonomously when needed during chat. However, you can guide it:

```python
# Research task — agent will use browser if needed
response = client.chat(
    "Go to https://news.ycombinator.com and summarize the top 5 stories",
    session_key="research",
)
print(response.content)

# Screenshot request
response = client.chat(
    "Take a screenshot of https://example.com",
    session_key="screenshots",
)
# The screenshot is captured and described in the response
```

### Tool calls in response

When the agent uses the browser, you'll see it reflected in `tool_calls`:

```python
response = client.chat("Check the weather on weather.gov")
for tool_call in response.tool_calls:
    print(f"Tool: {tool_call.name}")
    print(f"Args: {tool_call.arguments}")
```

---

## Limitations

- **No persistent browser state** — Each browser action starts with a clean session. No cookies or login state persists between conversations.
- **Public URLs only** — SSRF protection blocks private/internal addresses.
- **Timeout** — Browser actions time out after 120 seconds (configurable via `CONNECTION_TIMEOUT` on the Browserless container).
- **No file downloads** — The browser can view pages and extract content but doesn't download files to disk.
- **JavaScript-heavy pages** — Pages that require complex JS interaction may need explicit wait/click instructions.

---

## Disabling the Browser

If you don't need browser capabilities:

1. Remove the `browserless` service from `docker-compose.yml`
2. Unset `BROWSER_WS_ENDPOINT` in your `.env`

The agent will gracefully degrade — it won't attempt browser actions if no endpoint is configured.
