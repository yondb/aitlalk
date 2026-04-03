import { streamTtsToRoom } from "./elevenlabs";
import { trigger } from "./pusher-server";
import type { Side } from "./types";

/**
 * elevenlabs — tylko API ElevenLabs (MP3 w kliencie)
 * none — brak mowy (tekst na ekranie)
 * browser — wyłącznie gdy jawnie TTS_PROVIDER=browser (Web Speech, dev/test)
 *
 * Domyślnie: ElevenLabs przy ELEVENLABS_API_KEY, inaczej none (NIE przeglądarka).
 * Brak cichego fallbacku z ElevenLabs na Web Speech.
 */
export function resolveTtsProvider(): "elevenlabs" | "browser" | "none" {
  if (process.env.SKIP_TTS === "1" || process.env.SKIP_TTS === "true") {
    return "none";
  }
  const p = (process.env.TTS_PROVIDER || "").toLowerCase().trim();
  if (p === "none" || p === "off") return "none";
  if (p === "browser" || p === "web") return "browser";
  if (p === "elevenlabs") return "elevenlabs";
  return process.env.ELEVENLABS_API_KEY?.trim() ? "elevenlabs" : "none";
}

export async function scheduleTts(params: {
  roomId: string;
  speaker: Side;
  text: string;
  turnIndex: number;
}): Promise<void> {
  const mode = resolveTtsProvider();
  if (mode === "none") {
    await trigger(params.roomId, "audio-end", {
      speaker: params.speaker,
      turnIndex: params.turnIndex,
    });
    return;
  }
  if (mode === "browser") {
    await trigger(params.roomId, "browser-tts", {
      speaker: params.speaker,
      text: params.text,
      turnIndex: params.turnIndex,
    });
    await trigger(params.roomId, "audio-end", {
      speaker: params.speaker,
      turnIndex: params.turnIndex,
    });
    return;
  }
  await streamTtsToRoom(params);
}
