import type { Side } from "./types";
import { trigger } from "./pusher-server";

const BASE = "https://api.elevenlabs.io";

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

/** Streams TTS from ElevenLabs and forwards chunks over Pusher. Returns on success or logs and returns on failure. */
export async function streamTtsToRoom(params: {
  roomId: string;
  speaker: Side;
  text: string;
  turnIndex: number;
}): Promise<boolean> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = voiceFor(params.speaker);
  if (!apiKey || !voiceId) {
    await trigger(params.roomId, "audio-end", {
      speaker: params.speaker,
      turnIndex: params.turnIndex,
    });
    return false;
  }

  const url = `${BASE}/v1/text-to-speech/${encodeURIComponent(
    voiceId
  )}/stream?output_format=mp3_44100_128`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify(ttsRequestBody(params.text)),
    });
  } catch (e) {
    console.error("[elevenlabs] fetch failed", e);
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
  const chunkSize = 1500;

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
