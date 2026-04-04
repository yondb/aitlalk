import { fetchElevenLabsMp3Buffer } from "./elevenlabs";
import { generateDebateTurn } from "./deepseek";
import { getPrefetch, setPrefetch } from "./prefetch-store";
import { resolveTtsProvider } from "./tts";
import { getRoom } from "./store";
import type { Side } from "./types";

function speakerForTurnIndex(idx: number): Side {
  return idx % 2 === 0 ? "A" : "B";
}

export function prefetchEnabled(): boolean {
  const p = (process.env.DEBATE_PREFETCH || "").toLowerCase().trim();
  if (p === "0" || p === "false" || p === "off") return false;
  return true;
}

/**
 * W tle: następna tura (LLM + pełny MP3) zanim użytkownik skończy słuchać obecnej.
 * Tekst nie trafia do Pushera — tylko do Redis; UI widzi wypowiedź dopiero przy runTurn.
 */
export async function runPrefetchNextTurn(roomId: string): Promise<void> {
  if (!prefetchEnabled()) return;
  if (resolveTtsProvider() !== "elevenlabs") return;

  try {
    const room = await getRoom(roomId);
    if (!room || room.debateStatus !== "between_turns" || room.generationLocked) {
      return;
    }
    const nextIdx = room.currentTurnIndex;
    if (nextIdx >= room.totalTurns) return;

    const speaker = speakerForTurnIndex(nextIdx);
    const pending =
      speaker === "A" ? room.pendingInterventionA : room.pendingInterventionB;
    if (pending) return;

    const existing = await getPrefetch(roomId);
    if (
      existing?.turnIndex === nextIdx &&
      existing?.speaker === speaker
    ) {
      return;
    }

    const persona =
      speaker === "A" ? room.sideA : room.sideB;

    const text = await generateDebateTurn({
      topic: room.topic,
      side: speaker,
      personaName: persona.name,
      systemPrompt: persona.systemPrompt,
      transcript: room.transcript,
    });

    const buf = await fetchElevenLabsMp3Buffer(speaker, text);
    if (!buf?.length) return;

    await setPrefetch(roomId, {
      turnIndex: nextIdx,
      speaker,
      text,
      audioBase64: Buffer.from(buf).toString("base64"),
    });
  } catch (e) {
    console.error("[prefetch] runPrefetchNextTurn", e);
  }
}
