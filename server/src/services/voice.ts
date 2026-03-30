import OpenAI from "openai";
import { config } from "../config.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export type VoiceId =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "fable"
  | "nova"
  | "onyx"
  | "sage"
  | "shimmer";

export type AudioFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export interface TranscribeResult {
  text: string;
  language: string | null;
  duration: number | null;
}

export interface SynthesizeOptions {
  voice?: VoiceId;
  speed?: number;
  response_format?: AudioFormat;
}

/**
 * Transcribe audio to text using OpenAI Whisper.
 */
export async function transcribe(
  audioBuffer: Buffer,
  filename: string = "audio.webm",
): Promise<TranscribeResult> {
  const file = new File([new Uint8Array(audioBuffer)], filename, {
    type: mimeFromFilename(filename),
  });

  const result = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "verbose_json",
  });

  return {
    text: result.text,
    language: (result as any).language ?? null,
    duration: (result as any).duration ?? null,
  };
}

/**
 * Synthesize text to speech using OpenAI TTS.
 */
export async function synthesize(
  text: string,
  options: SynthesizeOptions = {},
): Promise<Buffer> {
  const voice = options.voice ?? "nova";
  const speed = options.speed ?? 1.0;
  const response_format = options.response_format ?? "opus";

  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice,
    input: text,
    speed,
    response_format,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function mimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimes: Record<string, string> = {
    webm: "audio/webm",
    ogg: "audio/ogg",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    m4a: "audio/m4a",
    mp4: "audio/mp4",
  };
  return mimes[ext ?? ""] ?? "audio/webm";
}
