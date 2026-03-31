import { randomUUID } from "crypto";
import { waitUntil } from "@vercel/functions";
import { generateDebateTurn } from "./deepseek";
import { scheduleTts } from "./tts";
import { getPublicBaseUrl, getInternalSecret } from "./public-url";
import { trigger } from "./pusher-server";
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
  await fetch(`${base}/api/debate/${roomId}/step`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
      "x-request-id": randomUUID(),
    },
  }).catch((e) => console.error("[debate] chain step failed", e));
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

  const speaker = speakerForTurnIndex(room.currentTurnIndex);
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

  const ttsJob = scheduleTts({ roomId, speaker, text });

  if (process.env.VERCEL) {
    waitUntil(ttsJob);
  } else {
    void ttsJob.catch((e) => console.error("[debate] TTS", e));
  }

  const fresh = await getRoom(roomId);
  if (!fresh) return { scheduleNext: false };

  fresh.transcript = [
    ...fresh.transcript,
    { side: speaker, content: text, at: Date.now() },
  ];
  fresh.currentTurnIndex += 1;

  if (fresh.currentTurnIndex >= fresh.totalTurns) {
    fresh.debateStatus = "ended";
    await saveRoom(fresh);
    await trigger(roomId, "debate-ended", {});
    return { scheduleNext: false };
  }

  fresh.debateStatus = "between_turns";
  await saveRoom(fresh);
  return { scheduleNext: true };
}
