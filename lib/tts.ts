import { streamTtsToRoom } from "./elevenlabs";
import { trigger } from "./pusher-server";
import type { Side } from "./types";

/**
 * elevenlabs — API ElevenLabs (płatne / wymaga klucza)
 * browser — Web Speech API w przeglądarce (darmowe, jakość zależy od OS)
 * none — brak mowy (tylko tekst)
 */
export function resolveTtsProvider(): "elevenlabs" | "browser" | "none" {
  if (process.env.SKIP_TTS === "1" || process.env.SKIP_TTS === "true") {
    return "none";
  }
  const p = (process.env.TTS_PROVIDER || "").toLowerCase().trim();
  if (p === "none" || p === "off") return "none";
  if (p === "browser" || p === "web") return "browser";
  if (p === "elevenlabs") return "elevenlabs";
  // Domyślnie: ElevenLabs tylko przy ustawionym kluczu, inaczej darmowy głos w przeglądarce
  return process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "browser";
}

export async function scheduleTts(params: {
  roomId: string;
  speaker: Side;
  text: string;
}): Promise<void> {
  const mode = resolveTtsProvider();
  if (mode === "none") {
    await trigger(params.roomId, "audio-end", { speaker: params.speaker });
    return;
  }
  if (mode === "browser") {
    await trigger(params.roomId, "browser-tts", {
      speaker: params.speaker,
      text: params.text,
    });
    await trigger(params.roomId, "audio-end", { speaker: params.speaker });
    return;
  }
  await streamTtsToRoom(params);
}
