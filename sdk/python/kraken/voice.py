"""Sync voice operations — transcription & text-to-speech."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from kraken.models import TranscriptionResult

if TYPE_CHECKING:
    from kraken._transport import Transport

VoiceId = Literal[
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"
]
AudioFormat = Literal["mp3", "opus", "aac", "flac", "wav", "pcm"]


class Voice:
    """Voice API — transcribe audio and synthesize speech."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def transcribe(
        self,
        audio: bytes,
        *,
        filename: str = "audio.webm",
        content_type: str = "audio/webm",
    ) -> TranscriptionResult:
        """Transcribe audio bytes to text.

        Args:
            audio: Raw audio bytes.
            filename: Filename hint for the server (determines codec detection).
            content_type: MIME type of the audio data.

        Returns:
            TranscriptionResult with text, language, and duration.
        """
        data = self._t.post_multipart(
            "/v1/voice/transcribe",
            files={"file": (filename, audio, content_type)},
        )
        return TranscriptionResult.model_validate(data)

    def synthesize(
        self,
        text: str,
        *,
        voice: VoiceId = "nova",
        speed: float = 1.0,
        response_format: AudioFormat = "opus",
    ) -> bytes:
        """Convert text to speech audio.

        Args:
            text: The text to synthesize (max 4096 chars).
            voice: TTS voice id.
            speed: Playback speed (0.25–4.0).
            response_format: Output audio format.

        Returns:
            Raw audio bytes in the requested format.
        """
        return self._t.post_binary(
            "/v1/voice/synthesize",
            json={
                "text": text,
                "voice": voice,
                "speed": speed,
                "response_format": response_format,
            },
        )
