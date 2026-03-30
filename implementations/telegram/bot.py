"""Telegram bot powered by Kraken Agent.

Each Telegram user gets a persistent session with full memory, identity,
and self-improving skills — the same brain you talk to everywhere else.

Usage:
    1. Create a bot via @BotFather on Telegram and copy the token.
    2. Copy .env.example to .env and fill in the values.
    3. pip install -r requirements.txt
    4. python bot.py
"""

import asyncio
import logging
import os

import dotenv
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from kraken import KrakenClient

dotenv.load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.environ["TELEGRAM_TOKEN"]
KRAKEN_API_URL = os.getenv("KRAKEN_API_URL", "http://localhost:8080")
KRAKEN_API_KEY = os.environ["KRAKEN_API_KEY"]
KRAKEN_MODEL = os.getenv("KRAKEN_MODEL", "gpt-5.4")

kraken = KrakenClient(
    api_url=KRAKEN_API_URL,
    model=KRAKEN_MODEL,
    api_key=KRAKEN_API_KEY,
)

# Telegram message limit
TG_MAX_LENGTH = 4096


def split_message(text: str, limit: int = TG_MAX_LENGTH) -> list[str]:
    """Split a long message into chunks that fit within Telegram's character limit.

    Splits on paragraph breaks first, then line breaks, then hard-cuts.
    """
    if len(text) <= limit:
        return [text]

    chunks: list[str] = []
    remaining = text

    while remaining:
        if len(remaining) <= limit:
            chunks.append(remaining)
            break

        # Try to split on a double newline (paragraph break)
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
        "Hey! I'm your Kraken assistant. Just send me a message and I'll remember "
        "everything across our conversations. Use /memory to search what I know, "
        "or /skills to see what I've learned."
    )


async def memory_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /memory <query> — search the knowledge graph."""
    query = " ".join(context.args) if context.args else ""
    if not query:
        await update.message.reply_text("Usage: /memory <query>\nExample: /memory What do you know about my projects?")
        return

    result = await asyncio.to_thread(kraken.memory.query, query)
    entities = "\n".join(f"• {e.name} ({e.type})" for e in result.entities[:10])
    await update.message.reply_text(
        f"🔍 *Memory results for:* {query}\n\n{entities or 'No entities found.'}",
        parse_mode="Markdown",
    )


async def skills_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /skills — list learned skills."""
    skills = await asyncio.to_thread(kraken.skills.list)
    listing = "\n".join(f"• *{s.name}* v{s.version}" for s in skills[:15])
    await update.message.reply_text(
        f"⚡ *Skills ({len(skills)} total):*\n\n{listing or 'No skills yet.'}",
        parse_mode="Markdown",
    )


async def soul_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /soul — view the agent's personality."""
    soul = await asyncio.to_thread(kraken.identity.get_soul)
    content = soul.content[:3900]  # Leave room for formatting
    await update.message.reply_text(f"```\n{content}\n```", parse_mode="Markdown")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle regular text messages — the main chat loop."""
    message = update.message
    if not message or not message.text:
        return

    user = message.from_user
    chat_id = message.chat_id

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
            "chat_id": str(chat_id),
            "username": user.username or "",
            "first_name": user.first_name or "",
        },
    )

    chunks = split_message(reply.content)
    for chunk in chunks:
        await message.reply_text(chunk)


def main() -> None:
    """Start the bot."""
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    # Commands
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("memory", memory_command))
    app.add_handler(CommandHandler("skills", skills_command))
    app.add_handler(CommandHandler("soul", soul_command))

    # Regular messages
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    logger.info("Starting Telegram bot...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
