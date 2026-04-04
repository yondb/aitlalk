import type { Side } from "./types";
import { trigger } from "./pusher-server";

const BASE = "https://api.elevenlabs.io";

/** ~7 KB base64 + ramka JSON — poniżej limitu ~10 KB Pusher na event. */
const PUSHER_MP3_CHUNK = 5000;

function voiceFor(side: Side): string | null {
  const id =
    side === "A"
      ? process.env.ELEVENLABS_VOICE_A
      : process.env.ELEVENLABS_VOICE_B;
  return id?.trim() || null;
}

function numEnv(name: string): number | undefined {
  const v = process.env[name]?.trim();
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Body zgodny z API v1 text-to-speech stream (model + opcjonalne voice_settings). */
function ttsRequestBody(text: string): Record<string, unknown> {
  const model =
    process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5";
  const body: Record<string, unknown> = {
    text,
    model_id: model,
  };
  const stability = numEnv("ELEVENLABS_STABILITY");
  const similarity = numEnv("ELEVENLABS_SIMILARITY_BOOST");
  const style = numEnv("ELEVENLABS_STYLE");
  const speed = numEnv("ELEVENLABS_SPEED");
  const useSpeakerBoost = process.env.ELEVENLABS_USE_SPEAKER_BOOST;
  const vs: Record<string, number | boolean> = {};
  if (stability !== undefined) vs.stability = stability;
  if (similarity !== undefined) vs.similarity_boost = similarity;
  if (style !== undefined) vs.style = style;
  if (speed !== undefined) vs.speed = speed;
  if (useSpeakerBoost === "1" || useSpeakerBoost === "true") {
    vs.use_speaker_boost = true;
  }
  if (Object.keys(vs).length > 0) {
    body.voice_settings = vs;
  }
  return body;
}

async function elevenLabsStreamResponse(
  speaker: Side,
  text: string
): Promise<Response | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = voiceFor(speaker);
  if (!apiKey || !voiceId) return null;

  const url = `${BASE}/v1/text-to-speech/${encodeURIComponent(
    voiceId
  )}/stream?output_format=mp3_44100_128`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(ttsRequestBody(text)),
    });
    return res;
  } catch (e) {
    console.error("[elevenlabs] fetch failed", e);
    return null;
  }
}

/** Cały MP3 w pamięci (prefetch / bufor). */
export async function fetchElevenLabsMp3Buffer(
  speaker: Side,
  text: string
): Promise<Uint8Array | null> {
  const res = await elevenLabsStreamResponse(speaker, text);
  if (!res) return null;
  if (!res.ok || !res.body) {
    console.error("[elevenlabs] bad response", res.status, await res.text());
    return null;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.length) parts.push(value);
    }
  } catch (e) {
    console.error("[elevenlabs] buffer read error", e);
    return null;
  }
  if (!parts.length) return null;
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Wysyła gotowy MP3 do Pushera (te same eventy co stream na żywo). */
export async function streamMp3BufferToRoom(params: {
  roomId: string;
  speaker: Side;
  turnIndex: number;
  buffer: Uint8Array;
}): Promise<void> {
  const { roomId, speaker, turnIndex, buffer } = params;
  let seq = 0;
  const chunkSize = PUSHER_MP3_CHUNK;
  try {
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const slice = buffer.subarray(i, i + chunkSize);
      const data = Buffer.from(slice).toString("base64");
      await trigger(roomId, "audio-chunk", {
        speaker,
        turnIndex,
        seq,
        data,
      });
      seq += 1;
    }
  } catch (e) {
    console.error("[elevenlabs] push buffer error", e);
  }
  await trigger(roomId, "audio-end", { speaker, turnIndex });
}

/** Streams TTS from ElevenLabs and forwards chunks over Pusher. Returns on success or logs and returns on failure. */
export async function streamTtsToRoom(params: {
  roomId: string;
  speaker: Side;
  text: string;
  turnIndex: number;
}): Promise<boolean> {
  const res = await elevenLabsStreamResponse(params.speaker, params.text);
  if (!res) {
    await trigger(params.roomId, "audio-end", {
      speaker: params.speaker,
      turnIndex: params.turnIndex,
    });
    return false;
  }

  if (!res.ok || !res.body) {
    console.error("[elevenlabs] bad response", res.status, await res.text());
    await trigger(params.roomId, "audio-end", {
      speaker: params.speaker,
      turnIndex: params.turnIndex,
    });
    return false;
  }

  const reader = res.body.getReader();
  let seq = 0;
  const chunkSize = PUSHER_MP3_CHUNK;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      for (let i = 0; i < value.length; i += chunkSize) {
        const slice = value.subarray(i, i + chunkSize);
        const data = Buffer.from(slice).toString("base64");
        await trigger(params.roomId, "audio-chunk", {
          speaker: params.speaker,
          turnIndex: params.turnIndex,
          seq,
          data,
        });
        seq += 1;
      }
    }
  } catch (e) {
    console.error("[elevenlabs] stream read error", e);
  }

  await trigger(params.roomId, "audio-end", {
    speaker: params.speaker,
    turnIndex: params.turnIndex,
  });
  return true;
}
