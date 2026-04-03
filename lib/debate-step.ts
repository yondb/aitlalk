import { randomUUID } from "crypto";
import { waitUntil } from "@vercel/functions";
import { generateDebateTurn } from "./deepseek";
import { scheduleTts } from "./tts";
import { getPublicBaseUrl, getInternalSecret } from "./public-url";
import { trigger } from "./pusher-server";
import { emitStateSync } from "./state-sync";
import { getRoom, saveRoom } from "./store";
import type { Side } from "./types";

function betweenTurnMs(): number {
  const n = Number(process.env.DEBATE_BETWEEN_TURN_MS);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
}

function speakerForTurnIndex(idx: number): Side {
  return idx % 2 === 0 ? "A" : "B";
}

export async function chainAfterDelay(roomId: string): Promise<void> {
  const delay = betweenTurnMs();
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  const base = getPublicBaseUrl();
  const secret = getInternalSecret();
  try {
    const res = await fetch(`${base}/api/debate/${roomId}/step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
        "x-request-id": randomUUID(),
      },
    });
    if (res.ok) return;
    const body = await res.text().catch(() => "");
    console.error("[debate] chain step bad status", res.status, body);
  } catch (e) {
    console.error("[debate] chain step failed", e);
  }

  // Fallback: if internal HTTP chaining is blocked (e.g. auth/proxy),
  // continue turns directly so the debate does not freeze.
  const { scheduleNext } = await runTurn(roomId);
  await emitStateSync(roomId);
  if (scheduleNext) {
    waitUntil(chainAfterDelay(roomId));
  }
}

/**
 * Runs one speaker turn (LLM + text events + TTS w tle).
 * Odblokowuje UI zaraz po tekście — głos nie trzyma kolejnej tury.
 */
export async function runTurn(roomId: string): Promise<{
  scheduleNext: boolean;
}> {
  const room = await getRoom(roomId);
  if (!room) return { scheduleNext: false };
  if (room.debateStatus === "lobby" || room.debateStatus === "ended") {
    return { scheduleNext: false };
  }
  if (room.generationLocked) return { scheduleNext: false };

  room.generationLocked = true;
  await saveRoom(room);

  const thisTurnIndex = room.currentTurnIndex;
  const speaker = speakerForTurnIndex(thisTurnIndex);
  const injection =
    speaker === "A" ? room.pendingInterventionA : room.pendingInterventionB;
  if (speaker === "A") delete room.pendingInterventionA;
  else delete room.pendingInterventionB;
  await saveRoom(room);

  const persona =
    speaker === "A"
      ? { name: room.sideA.name, systemPrompt: room.sideA.systemPrompt }
      : { name: room.sideB.name, systemPrompt: room.sideB.systemPrompt };

  let text: string;
  try {
    const snapshot = await getRoom(roomId);
    text = await generateDebateTurn({
      topic: snapshot!.topic,
      side: speaker,
      personaName: persona.name,
      systemPrompt: persona.systemPrompt,
      moderatorInjection: injection,
      transcript: snapshot!.transcript,
    });
  } catch (e) {
    console.error("[debate] DeepSeek failed", e);
    text = `[GENERATION ERROR — ${
      speaker === "A" ? "Side A" : "Side B"
    } could not respond. Continuing.]`;
  }

  try {
    await trigger(roomId, "turn-start", { speaker, text });

    const parts = text.split(/(\s+)/).filter((p) => p.length > 0);
    for (const p of parts) {
      await trigger(roomId, "turn-chunk", { speaker, textChunk: p });
    }

    await trigger(roomId, "turn-end", { speaker });
  } catch (e) {
    console.error("[debate] Pusher text events failed", e);
  }

  const rUnlock = await getRoom(roomId);
  if (rUnlock) {
    rUnlock.generationLocked = false;
    await saveRoom(rUnlock);
  }

  // Zapis transkryptu przed TTS — klient może od razu pobrać pełną listę przy uzupełnianiu luk audio.
  const fresh = await getRoom(roomId);
  if (!fresh) return { scheduleNext: false };

  fresh.transcript = [
    ...fresh.transcript,
    { side: speaker, content: text, at: Date.now() },
  ];
  fresh.currentTurnIndex += 1;

  const ended = fresh.currentTurnIndex >= fresh.totalTurns;
  fresh.debateStatus = ended ? "ended" : "between_turns";
  await saveRoom(fresh);

  try {
    await scheduleTts({ roomId, speaker, text, turnIndex: thisTurnIndex });
  } catch (e) {
    console.error("[debate] TTS failed", e);
  }

  if (ended) {
    await trigger(roomId, "debate-ended", {});
    return { scheduleNext: false };
  }

  return { scheduleNext: true };
}
