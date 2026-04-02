import type { Side } from "./types";
import { trigger } from "./pusher-server";

const BASE = "https://api.elevenlabs.io";

function voiceFor(side: Side): string | null {
  const id =
    side === "A"
      ? process.env.ELEVENLABS_VOICE_A
      : process.env.ELEVENLABS_VOICE_B;
  return id || null;
}

/** Streams TTS from ElevenLabs and forwards chunks over Pusher. Returns on success or logs and returns on failure. */
export async function streamTtsToRoom(params: {
  roomId: string;
  speaker: Side;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = voiceFor(params.speaker);
  if (!apiKey || !voiceId) {
    await trigger(params.roomId, "audio-end", { speaker: params.speaker });
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
      body: JSON.stringify({
        text: params.text,
        model_id: "eleven_flash_v2_5",
      }),
    });
  } catch (e) {
    console.error("[elevenlabs] fetch failed", e);
    await trigger(params.roomId, "audio-end", { speaker: params.speaker });
    return false;
  }

  if (!res.ok || !res.body) {
    console.error("[elevenlabs] bad response", res.status, await res.text());
    await trigger(params.roomId, "audio-end", { speaker: params.speaker });
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
          seq,
          data,
        });
        seq += 1;
      }
    }
  } catch (e) {
    console.error("[elevenlabs] stream read error", e);
  }

  await trigger(params.roomId, "audio-end", { speaker: params.speaker });
  return true;
}
