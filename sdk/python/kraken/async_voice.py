"""Async voice operations — transcription & text-to-speech."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from kraken.models import TranscriptionResult

if TYPE_CHECKING:
    from kraken._transport import AsyncTransport

VoiceId = Literal[
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"
]
AudioFormat = Literal["mp3", "opus", "aac", "flac", "wav", "pcm"]


class AsyncVoice:
    """Async Voice API — transcribe audio and synthesize speech."""

    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def transcribe(
        self,
        audio: bytes,
        *,
        filename: str = "audio.webm",
        content_type: str = "audio/webm",
    ) -> TranscriptionResult:
        """Transcribe audio bytes to text."""
        data = await self._t.post_multipart(
            "/v1/voice/transcribe",
            files={"file": (filename, audio, content_type)},
        )
        return TranscriptionResult.model_validate(data)

    async def synthesize(
        self,
        text: str,
        *,
        voice: VoiceId = "nova",
        speed: float = 1.0,
        response_format: AudioFormat = "opus",
    ) -> bytes:
        """Convert text to speech audio."""
        return await self._t.post_binary(
            "/v1/voice/synthesize",
            json={
                "text": text,
                "voice": voice,
                "speed": speed,
                "response_format": response_format,
            },
        )
