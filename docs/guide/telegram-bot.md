---
layout: layouts/docs.njk
title: Telegram Bot
description: Connect your Kraken assistant to Telegram
---

# Telegram Bot

This guide walks through connecting your Kraken instance to Telegram — another channel for your personal assistant. Each Telegram user gets their own persistent session with full memory, identity, and self-improving skills. Same Kraken, same brain, just another way to reach it.

## Prerequisites

- A running Kraken Agent instance (see [Quick Start](../getting-started/quickstart.md))
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Python 3.11+
- `python-telegram-bot` and `kraken-agent` packages

## Setup

### Create the bot on Telegram

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts (choose a name and username)
3. Copy the HTTP API token BotFather gives you
4. Optionally, send `/setcommands` to register the bot's commands:
   ```
   start - Start chatting
   memory - Search the knowledge graph
   skills - List learned skills
   soul - View the agent's personality
   ```

### Install dependencies

```bash
pip install python-telegram-bot kraken-agent python-dotenv
```

### Environment variables

Create a `.env` file:

```bash
TELEGRAM_TOKEN=your-telegram-bot-token
KRAKEN_API_URL=http://localhost:8080
KRAKEN_API_KEY=your-kraken-api-key
KRAKEN_MODEL=gpt-5.4
```

## The Bot

```python
"""Telegram bot powered by Kraken Agent."""

import asyncio
import logging
import os

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from kraken import KrakenClient

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Kraken Client ---
kraken = KrakenClient(
    api_url=os.environ["KRAKEN_API_URL"],
    model=os.environ.get("KRAKEN_MODEL", "gpt-5.4"),
    api_key=os.environ.get("KRAKEN_API_KEY"),
)

# Telegram message limit
TG_MAX_LENGTH = 4096


def split_message(text: str, limit: int = TG_MAX_LENGTH) -> list[str]:
    """Split a long message into chunks that fit within Telegram's limit."""
    if len(text) <= limit:
        return [text]

    chunks: list[str] = []
    remaining = text

    while remaining:
        if len(remaining) <= limit:
            chunks.append(remaining)
            break

        cut = remaining.rfind("\n\n", 0, limit)
        if cut == -1:
            cut = remaining.rfind("\n", 0, limit)
        if cut == -1:
            cut = remaining.rfind(" ", 0, limit)
        if cut == -1:
            cut = limit

        chunks.append(remaining[:cut].rstrip())
        remaining = remaining[cut:].lstrip("\n")

    return chunks


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start — introduce the bot."""
    await update.message.reply_text(
        "Hey! I'm your Kraken assistant. Just send me a message and I'll "
        "remember everything across our conversations."
    )


async def memory_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /memory <query> — search the knowledge graph."""
    query = " ".join(context.args) if context.args else ""
    if not query:
        await update.message.reply_text(
            "Usage: /memory <query>\nExample: /memory What do you know about my projects?"
        )
        return

    result = await asyncio.to_thread(kraken.memory.query, query)
    entities = "\n".join(f"• {e.name} ({e.type})" for e in result.entities[:10])
    await update.message.reply_text(
        f"🔍 Memory results for: {query}\n\n{entities or 'No entities found.'}"
    )


async def skills_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /skills — list learned skills."""
    skills = await asyncio.to_thread(kraken.skills.list)
    listing = "\n".join(f"• {s.name} v{s.version}" for s in skills[:15])
    await update.message.reply_text(
        f"⚡ Skills ({len(skills)} total):\n\n{listing or 'No skills yet.'}"
    )


async def soul_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /soul — view the agent's personality."""
    soul = await asyncio.to_thread(kraken.identity.get_soul)
    await update.message.reply_text(soul.content[:3900])


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle regular text messages — the main chat loop."""
    message = update.message
    if not message or not message.text:
        return

    user = message.from_user

    # Show "typing..." indicator
    await message.chat.send_action("typing")

    # Each Telegram user gets a unique persistent session
    session_key = f"telegram-{user.id}"

    reply = await asyncio.to_thread(
        kraken.chat,
        message.text,
        session_key=session_key,
        session_name=f"Telegram {user.first_name or user.username or user.id}",
        metadata={
            "provider": "telegram",
            "provider_user_id": str(user.id),
            "chat_id": str(message.chat_id),
            "username": user.username or "",
        },
    )

    chunks = split_message(reply.content)
    for chunk in chunks:
        await message.reply_text(chunk)


def main() -> None:
    """Start the bot."""
    app = Application.builder().token(os.environ["TELEGRAM_TOKEN"]).build()

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("memory", memory_command))
    app.add_handler(CommandHandler("skills", skills_command))
    app.add_handler(CommandHandler("soul", soul_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    logger.info("Starting Telegram bot...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
```

## Run

```bash
python bot.py
```

Message your bot on Telegram and start chatting.

## What's Happening

Each time a Telegram user sends a message:

1. The bot routes to a session keyed by `telegram-{user_id}`
2. Kraken loads that user's full conversation history, user model, and relevant memory
3. The response is generated with full context
4. Background workers extract entities, update the user model, and reflect on skills

Since this is the same Kraken instance you use from Discord, CLI, or anywhere else, knowledge transfers across platforms. Tell your assistant something on Telegram and it remembers when you ask from Discord.

## Session Routing Options

### Per-user sessions (default)

Each user gets their own persistent session:

```python
session_key = f"telegram-{user.id}"
```

### Per-chat sessions

In group chats, give the whole group a shared session:

```python
session_key = f"telegram-chat-{message.chat_id}"
```

### Per-user, per-chat sessions

Separate session per user per group:

```python
session_key = f"telegram-{message.chat_id}-{user.id}"
```

## Group Chat Support

To have the bot respond in group chats (not just DMs), you have two options:

### Respond only when mentioned

```python
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    message = update.message
    if not message or not message.text:
        return

    # In groups, only respond when the bot is mentioned
    if message.chat.type != "private":
        bot_username = (await context.bot.get_me()).username
        if f"@{bot_username}" not in message.text:
            return
        # Strip the mention from the message
        content = message.text.replace(f"@{bot_username}", "").strip()
    else:
        content = message.text

    if not content:
        return

    # ... rest of handler
```

### Respond to replies

```python
    # In groups, respond to mentions or replies to the bot
    if message.chat.type != "private":
        is_reply_to_bot = (
            message.reply_to_message
            and message.reply_to_message.from_user
            and message.reply_to_message.from_user.id == context.bot.id
        )
        bot_username = (await context.bot.get_me()).username
        is_mention = f"@{bot_username}" in message.text

        if not is_reply_to_bot and not is_mention:
            return
```

## Identity Linking

Link Telegram users to their accounts on other platforms so Kraken recognizes them everywhere:

```python
kraken.identity.link_identity(
    canonical_user_id="alice",
    provider="telegram",
    provider_user_id=str(user.id),
    display_name=user.first_name or user.username,
)
```

Now when Alice talks on Discord and Telegram, Kraken knows it's the same person.

## Next Steps

- Set up [Scheduled Tasks](scheduled-tasks.md) to have Kraken send you daily briefings on Telegram
- Connect [Discord](discord-bot.md) too — same brain, another channel
- Configure the [Identity System](../concepts/identity.md) to link users across platforms
- Customize the agent's personality via [SOUL.md](../concepts/identity.md#soulmd--the-agents-personality)
