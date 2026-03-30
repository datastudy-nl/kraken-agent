"""Discord voice integration — plug-and-play voice chat for Discord bots.

Requires optional dependencies::

    pip install "kraken-agent[discord]"

Usage::

    import discord
    from kraken import AsyncKrakenClient
    from kraken.discord import KrakenVoiceBot

    kraken = AsyncKrakenClient(api_url="...", api_key="...")
    bot = discord.Bot(intents=discord.Intents.default())
    voice = KrakenVoiceBot(bot, kraken)
    voice.register_commands()   # adds /join, /leave, /voice-model
    bot.run("DISCORD_TOKEN")
"""

from __future__ import annotations

import asyncio
import io
import logging
import struct
import time
from typing import Any

try:
    import discord
    from discord import app_commands
    from discord.ext import commands
except ImportError as exc:
    raise ImportError(
        "discord.py is required for voice integration. "
        "Install it with: pip install 'discord.py[voice]'"
    ) from exc

from kraken.async_client import AsyncKrakenClient
from kraken.async_voice import AudioFormat, VoiceId

logger = logging.getLogger("kraken.discord")


class AudioSink(discord.AudioSink if hasattr(discord, "AudioSink") else object):
    """Collects raw PCM audio from a single user in a voice channel.

    discord.py >= 2.4 with voice recv support provides AudioSink.
    For older versions, we fall back to a polling-based recorder.
    """

    def __init__(self) -> None:
        self.buffer = bytearray()
        self.last_packet_time: float = time.monotonic()

    if hasattr(discord, "AudioSink"):
        def write(self, data: discord.VoiceData) -> None:  # type: ignore[override]
            self.buffer.extend(data.pcm)
            self.last_packet_time = time.monotonic()

        def cleanup(self) -> None:
            self.buffer.clear()


class UserAudioTracker:
    """Track per-user audio buffers and detect silence boundaries."""

    def __init__(self, silence_threshold: float = 1.5) -> None:
        self.silence_threshold = silence_threshold
        self.buffers: dict[int, bytearray] = {}
        self.last_packet: dict[int, float] = {}

    def feed(self, user_id: int, pcm_data: bytes) -> None:
        if user_id not in self.buffers:
            self.buffers[user_id] = bytearray()
        self.buffers[user_id].extend(pcm_data)
        self.last_packet[user_id] = time.monotonic()

    def get_finished_users(self) -> list[int]:
        """Return user IDs who have stopped speaking (silence exceeded threshold)."""
        now = time.monotonic()
        finished = []
        for user_id, last_time in list(self.last_packet.items()):
            if now - last_time > self.silence_threshold and user_id in self.buffers:
                if len(self.buffers[user_id]) > 3200:  # min ~100ms of audio
                    finished.append(user_id)
        return finished

    def pop_audio(self, user_id: int) -> bytes:
        """Retrieve and clear the audio buffer for a user."""
        data = bytes(self.buffers.pop(user_id, b""))
        self.last_packet.pop(user_id, None)
        return data


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 48000, channels: int = 2) -> bytes:
    """Wrap raw PCM data in a WAV header."""
    bits_per_sample = 16
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    data_size = len(pcm_data)

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,  # PCM format
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + pcm_data


class KrakenVoiceBot:
    """High-level Discord voice chat powered by Kraken.

    This class manages:
    - Joining / leaving voice channels
    - Recording user speech with silence detection
    - Transcription → Kraken chat → TTS pipeline
    - Playing synthesized audio responses

    Args:
        bot: A discord.py Bot or Client instance.
        kraken: An AsyncKrakenClient connected to a Kraken API.
        voice_id: Default TTS voice to use.
        silence_seconds: Seconds of silence before processing a user's speech.
        session_prefix: Prefix for Kraken session keys (e.g. "discord-voice-{channel_id}").
    """

    def __init__(
        self,
        bot: discord.Client,
        kraken: AsyncKrakenClient,
        *,
        voice_id: VoiceId = "nova",
        silence_seconds: float = 1.5,
        session_prefix: str = "discord-voice",
    ) -> None:
        self.bot = bot
        self.kraken = kraken
        self.voice_id = voice_id
        self.silence_seconds = silence_seconds
        self.session_prefix = session_prefix

        self._trackers: dict[int, UserAudioTracker] = {}  # guild_id → tracker
        self._listen_tasks: dict[int, asyncio.Task[None]] = {}
        self._voice_clients: dict[int, discord.VoiceClient] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def join(self, channel: discord.VoiceChannel) -> discord.VoiceClient:
        """Join a voice channel and start listening."""
        guild_id = channel.guild.id

        if guild_id in self._voice_clients:
            vc = self._voice_clients[guild_id]
            if vc.is_connected():
                await vc.move_to(channel)
                return vc
            else:
                await self._cleanup_guild(guild_id)

        vc = await channel.connect()
        self._voice_clients[guild_id] = vc
        self._trackers[guild_id] = UserAudioTracker(
            silence_threshold=self.silence_seconds
        )

        # Start the listen/process loop
        task = asyncio.create_task(self._listen_loop(guild_id))
        self._listen_tasks[guild_id] = task

        logger.info("Joined voice channel %s in guild %s", channel.name, guild_id)
        return vc

    async def leave(self, guild_id: int) -> None:
        """Leave the voice channel in the given guild."""
        await self._cleanup_guild(guild_id)
        logger.info("Left voice channel in guild %s", guild_id)

    def register_commands(self, tree: app_commands.CommandTree | None = None) -> None:
        """Register /join, /leave, and /voice-model slash commands.

        If *tree* is not provided, the bot must be a commands.Bot so we can
        access its command tree.
        """
        if tree is None:
            if isinstance(self.bot, commands.Bot):
                tree = self.bot.tree
            else:
                raise TypeError(
                    "Cannot auto-detect command tree. "
                    "Pass a commands.Bot or provide the tree explicitly."
                )

        kraken_voice = self  # capture for closures

        @tree.command(name="join", description="Join your voice channel for live voice chat")
        async def join_cmd(interaction: discord.Interaction) -> None:
            if not interaction.user.voice or not interaction.user.voice.channel:  # type: ignore[union-attr]
                await interaction.response.send_message(
                    "You need to be in a voice channel first!", ephemeral=True
                )
                return
            channel = interaction.user.voice.channel  # type: ignore[union-attr]
            await interaction.response.defer(ephemeral=True)
            await kraken_voice.join(channel)  # type: ignore[arg-type]
            await interaction.followup.send(
                f"Joined **{channel.name}** — I'm listening!", ephemeral=True
            )

        @tree.command(name="leave", description="Leave the voice channel")
        async def leave_cmd(interaction: discord.Interaction) -> None:
            if not interaction.guild:
                await interaction.response.send_message("Not in a guild.", ephemeral=True)
                return
            await interaction.response.defer(ephemeral=True)
            await kraken_voice.leave(interaction.guild.id)
            await interaction.followup.send("Left the voice channel.", ephemeral=True)

        @tree.command(name="voice-model", description="Change the TTS voice")
        @app_commands.describe(voice="The voice to use for speech synthesis")
        @app_commands.choices(
            voice=[
                app_commands.Choice(name=v, value=v)
                for v in [
                    "alloy", "ash", "ballad", "coral", "echo",
                    "fable", "nova", "onyx", "sage", "shimmer",
                ]
            ]
        )
        async def voice_model_cmd(
            interaction: discord.Interaction, voice: app_commands.Choice[str]
        ) -> None:
            kraken_voice.voice_id = voice.value  # type: ignore[assignment]
            await interaction.response.send_message(
                f"Voice changed to **{voice.name}**.", ephemeral=True
            )

    # ------------------------------------------------------------------
    # Internal: listen loop
    # ------------------------------------------------------------------

    async def _listen_loop(self, guild_id: int) -> None:
        """Poll for finished audio and process it through the Kraken pipeline."""
        tracker = self._trackers[guild_id]

        while guild_id in self._voice_clients:
            vc = self._voice_clients.get(guild_id)
            if not vc or not vc.is_connected():
                break

            # Check for users who stopped speaking
            finished_users = tracker.get_finished_users()
            for user_id in finished_users:
                pcm_data = tracker.pop_audio(user_id)
                if pcm_data:
                    asyncio.create_task(
                        self._process_speech(guild_id, user_id, pcm_data)
                    )

            await asyncio.sleep(0.2)

    async def _process_speech(
        self, guild_id: int, user_id: int, pcm_data: bytes
    ) -> None:
        """Transcribe → Chat → TTS → Play pipeline."""
        try:
            # 1) Convert PCM to WAV for transcription
            wav_data = pcm_to_wav(pcm_data)

            # 2) Transcribe
            result = await self.kraken.voice.transcribe(
                wav_data, filename="speech.wav", content_type="audio/wav"
            )

            if not result.text.strip():
                return

            user = self.bot.get_user(user_id)
            username = str(user) if user else str(user_id)
            logger.info("[%s] said: %s", username, result.text)

            # 3) Chat — send transcribed text through Kraken
            vc = self._voice_clients.get(guild_id)
            channel_id = vc.channel.id if vc and vc.channel else guild_id
            session_key = f"{self.session_prefix}-{channel_id}"

            chat_response = await self.kraken.chat(
                result.text,
                session_key=session_key,
                session_name=f"Discord Voice {channel_id}",
                metadata={
                    "discord_user": username,
                    "discord_user_id": str(user_id),
                    "input_mode": "voice",
                },
            )

            if not chat_response.content.strip():
                return

            logger.info("Agent replied: %s", chat_response.content[:100])

            # 4) Synthesize response to speech
            audio_data = await self.kraken.voice.synthesize(
                chat_response.content,
                voice=self.voice_id,
                response_format="opus",
            )

            # 5) Play in voice channel
            if vc and vc.is_connected():
                await self._play_audio(vc, audio_data)

        except Exception:
            logger.exception("Error processing speech from user %s", user_id)

    async def _play_audio(self, vc: discord.VoiceClient, audio_data: bytes) -> None:
        """Play audio bytes through the voice connection."""
        # Write to a temp buffer and play with FFmpeg
        audio_io = io.BytesIO(audio_data)
        source = discord.FFmpegOpusAudio(audio_io, pipe=True)

        if vc.is_playing():
            vc.stop()

        play_complete = asyncio.Event()
        vc.play(source, after=lambda _: play_complete.set())
        await play_complete.wait()

    # ------------------------------------------------------------------
    # Internal: cleanup
    # ------------------------------------------------------------------

    async def _cleanup_guild(self, guild_id: int) -> None:
        """Stop listening and disconnect from a guild's voice channel."""
        task = self._listen_tasks.pop(guild_id, None)
        if task:
            task.cancel()

        self._trackers.pop(guild_id, None)

        vc = self._voice_clients.pop(guild_id, None)
        if vc and vc.is_connected():
            await vc.disconnect()


class KrakenVoiceCog(commands.Cog):
    """A discord.py Cog that wraps KrakenVoiceBot for easy integration.

    Usage::

        bot = commands.Bot(command_prefix="!", intents=intents)
        kraken = AsyncKrakenClient(...)
        await bot.add_cog(KrakenVoiceCog(bot, kraken))
    """

    def __init__(
        self,
        bot: commands.Bot,
        kraken: AsyncKrakenClient,
        **kwargs: Any,
    ) -> None:
        self.voice_bot = KrakenVoiceBot(bot, kraken, **kwargs)

    async def cog_load(self) -> None:
        self.voice_bot.register_commands(self.voice_bot.bot.tree)  # type: ignore[union-attr]

    @commands.Cog.listener()
    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ) -> None:
        # Auto-leave if everyone else left
        if before.channel and not after.channel:
            vc = self.voice_bot._voice_clients.get(member.guild.id)
            if vc and vc.channel == before.channel:
                # Check if bot is the only one left
                members = [m for m in before.channel.members if not m.bot]
                if not members:
                    await self.voice_bot.leave(member.guild.id)
