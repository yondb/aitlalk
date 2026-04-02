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

function allowElevenlabsFallbackToBrowser(): boolean {
  const p = (process.env.TTS_PROVIDER || "").toLowerCase().trim();
  // If user explicitly forces ElevenLabs, don't silently fall back.
  if (p === "elevenlabs") return false;
  return true;
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
  const ok = await streamTtsToRoom(params);
  if (!ok && allowElevenlabsFallbackToBrowser()) {
    await trigger(params.roomId, "browser-tts", {
      speaker: params.speaker,
      text: params.text,
      turnIndex: params.turnIndex,
    });
    await trigger(params.roomId, "audio-end", {
      speaker: params.speaker,
      turnIndex: params.turnIndex,
    });
  }
}
