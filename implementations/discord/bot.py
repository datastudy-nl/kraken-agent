import asyncio
import io
import os
import dotenv

import discord
from kraken import KrakenClient

dotenv.load_dotenv()  # Load environment variables from .env file

DISCORD_TOKEN = os.environ["DISCORD_TOKEN"]
KRAKEN_API_URL = os.getenv("KRAKEN_API_URL", "http://localhost:8080")
KRAKEN_API_KEY = os.environ["KRAKEN_API_KEY"]
KRAKEN_MODEL = os.getenv("KRAKEN_MODEL", "gpt-5.4")

kraken = KrakenClient(
    api_url=KRAKEN_API_URL,
    model=KRAKEN_MODEL,
    api_key=KRAKEN_API_KEY,
)

intents = discord.Intents.default()
intents.message_content = True
bot = discord.Client(intents=intents)


@bot.event
async def on_ready() -> None:
    print(f"Logged in as {bot.user}")


def split_message(text: str, limit: int = 1990) -> list[str]:
    """Split a long message into chunks that fit within Discord's character limit.

    Splits on paragraph breaks first, then line breaks, then hard-cuts as a
    last resort.  Each chunk stays under *limit* characters.
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
            # Fall back to a single newline
            cut = remaining.rfind("\n", 0, limit)
        if cut == -1:
            # Fall back to a space
            cut = remaining.rfind(" ", 0, limit)
        if cut == -1:
            # Hard cut
            cut = limit

        chunks.append(remaining[:cut].rstrip())
        remaining = remaining[cut:].lstrip("\n")

    return chunks


async def download_sandbox_file(session_id: str, path: str) -> discord.File | None:
    """Download a file from the sandbox workspace and return it as a discord.File."""
    try:
        data = await asyncio.to_thread(kraken.files.read_bytes, session_id, path)
        filename = path.rsplit("/", 1)[-1]
        return discord.File(io.BytesIO(data), filename=filename)
    except Exception:
        return None


@bot.event
async def on_message(message: discord.Message) -> None:
    if message.author.bot:
        return
    # if message.channel.id != 1487128195537833994:  # Only respond in the specified channel
    #     return

    # Extract image URLs from attachments
    image_urls = [
        a.url
        for a in message.attachments
        if a.content_type and a.content_type.startswith("image/")
    ]

    async with message.channel.typing():
        reply = await asyncio.to_thread(
            kraken.chat,
            f"[discord] {message.author}> {message.content}" or "What's in this image?",
            session_key=f"discord-{message.channel.id}",
            session_name=f"Discord channel {message.channel.id}",
            images=image_urls or None,
            metadata={"discord_user": str(message.author), "discord_user_id": str(message.author.id)},
        )

    # Download any file attachments from the response
    attachments: list[discord.File] = []
    for att in reply.attachments:
        file = await download_sandbox_file(reply.session_id, att.path)
        if file:
            attachments.append(file)

    chunks = split_message(reply.content)
    first = True
    for chunk in chunks:
        if first:
            await message.reply(chunk, files=attachments if attachments else None)
            first = False
        else:
            await message.channel.send(chunk)


if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)
