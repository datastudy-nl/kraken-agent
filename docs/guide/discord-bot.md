---
layout: layouts/docs.njk
title: Discord Bot
description: Build a Discord bot with persistent memory and self-improving skills
---

# Discord Bot

This guide walks through building a Discord bot powered by Kraken Agent. Each Discord user gets their own persistent session with full memory, identity, and self-improving skills.

## Prerequisites

- A running Kraken Agent instance (see [Quick Start](../getting-started/quickstart.md))
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- Python 3.11+
- `discord.py` and `kraken-agent` packages

## Setup

### Create the bot on Discord

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** → **Reset Token** → copy the token
4. Under **Privileged Gateway Intents**, enable **Message Content Intent**
5. Go to **OAuth2** → **URL Generator** → select `bot` scope → select `Send Messages`, `Read Message History` permissions
6. Use the generated URL to invite the bot to your server

### Install dependencies

```bash
pip install discord.py kraken-agent python-dotenv
```

### Environment variables

Create a `.env` file:

```bash
DISCORD_TOKEN=your-discord-bot-token
KRAKEN_URL=http://localhost:8080
KRAKEN_API_KEY=your-kraken-api-key
KRAKEN_MODEL=gpt-4.1
```

## The Bot

```python
"""Discord bot powered by Kraken Agent."""

import os
import discord
from dotenv import load_dotenv
from kraken import KrakenClient

load_dotenv()

# --- Kraken Client ---
kraken = KrakenClient(
    api_url=os.environ["KRAKEN_URL"],
    model=os.environ.get("KRAKEN_MODEL", "gpt-4.1"),
    api_key=os.environ.get("KRAKEN_API_KEY"),
)

# --- Discord Client ---
intents = discord.Intents.default()
intents.message_content = True
bot = discord.Client(intents=intents)


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")

    # Link bot identity
    kraken.identity.link_identity(
        canonical_user_id="kraken-discord-bot",
        provider="discord",
        provider_user_id=str(bot.user.id),
        display_name=str(bot.user),
    )


@bot.event
async def on_message(message: discord.Message):
    # Don't respond to self or other bots
    if message.author == bot.user or message.author.bot:
        return

    # Only respond when mentioned or in DMs
    if not (bot.user.mentioned_in(message) or isinstance(message.channel, discord.DMChannel)):
        return

    # Clean the message (remove bot mention)
    content = message.content.replace(f"<@{bot.user.id}>", "").strip()
    if not content:
        return

    async with message.channel.typing():
        # Each Discord user gets a unique persistent session
        session_key = f"discord-{message.author.id}"

        response = kraken.chat(
            content,
            session_key=session_key,
            metadata={
                "provider": "discord",
                "provider_user_id": str(message.author.id),
                "channel": str(message.channel.id),
                "guild": str(message.guild.id) if message.guild else None,
                "username": str(message.author),
            },
        )

    # Discord has a 2000 char limit
    reply = response.content
    if len(reply) > 2000:
        # Split into chunks
        chunks = [reply[i:i+1990] for i in range(0, len(reply), 1990)]
        for chunk in chunks:
            await message.reply(chunk)
    else:
        await message.reply(reply)


bot.run(os.environ["DISCORD_TOKEN"])
```

## Run

```bash
python bot.py
```

## What's Happening

Each time a Discord user sends a message:

1. The bot routes to a session keyed by `discord-{user_id}`
2. Kraken loads that user's full conversation history, user model, and relevant memory
3. The response is generated with full context
4. Background workers extract entities, update the user model, and reflect on skills

This means:

- **Persistent memory** — The bot remembers past conversations with each user
- **Cross-session knowledge** — Entities extracted from one conversation are available in future ones
- **Self-improvement** — The bot learns common patterns and creates skills automatically

## Advanced: Slash Commands

You can extend the bot with slash commands for direct Kraken features:

```python
from discord import app_commands

tree = app_commands.CommandTree(bot)

@tree.command(name="memory", description="Query Kraken's memory")
async def memory_cmd(interaction: discord.Interaction, query: str):
    result = kraken.memory.query(query)
    entities = "\n".join(f"• {e.name} ({e.type})" for e in result.entities[:10])
    await interaction.response.send_message(
        f"**Memory results for:** {query}\n\n{entities or 'No entities found.'}"
    )

@tree.command(name="skills", description="List Kraken's learned skills")
async def skills_cmd(interaction: discord.Interaction):
    skills = kraken.skills.list()
    listing = "\n".join(f"• **{s.name}** v{s.version}" for s in skills[:15])
    await interaction.response.send_message(
        f"**Skills ({len(skills)} total):**\n\n{listing or 'No skills yet.'}"
    )

@tree.command(name="soul", description="View the agent's personality")
async def soul_cmd(interaction: discord.Interaction):
    soul = kraken.identity.get_soul()
    await interaction.response.send_message(f"```\n{soul.content[:1900]}\n```")

@bot.event
async def on_ready():
    await tree.sync()
    print(f"Logged in as {bot.user}")
```

## Advanced: Multi-Server Isolation

If you want each Discord server (guild) to have its own session space:

```python
# Per-guild, per-user sessions
session_key = f"discord-{message.guild.id}-{message.author.id}"
```

Or per-channel sessions (shared context within a channel):

```python
# Per-channel sessions
session_key = f"discord-{message.channel.id}"
```

## Next Steps

- Set up [Scheduled Tasks](scheduled-tasks.md) to have Kraken post daily summaries to a channel
- Configure the [Identity System](../concepts/identity.md) to link Discord users to other platforms
- Customize the agent's personality via [SOUL.md](../concepts/identity.md#soulmd--the-agents-personality)
