import { randomUUID } from "crypto";
import { waitUntil } from "@vercel/functions";
import { streamMp3BufferToRoom } from "./elevenlabs";
import { generateDebateTurn } from "./deepseek";
import { prefetchEnabled, runPrefetchNextTurn } from "./prefetch-turn";
import { clearPrefetch, getPrefetch } from "./prefetch-store";
import { getPublicBaseUrl, getInternalSecret } from "./public-url";
import { scheduleTts, resolveTtsProvider } from "./tts";
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

  const { scheduleNext } = await runTurn(roomId);
  await emitStateSync(roomId);
  if (scheduleNext) {
    waitUntil(chainAfterDelay(roomId));
  }
}

/**
 * Runs one speaker turn (LLM + text events + TTS).
 * Opcjonalnie zużywa prefetch (LLM+MP3 następnej tury przygotowane w tle).
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

  const pre = await getPrefetch(roomId);
  const usePrefetchBuffer =
    prefetchEnabled() &&
    resolveTtsProvider() === "elevenlabs" &&
    pre?.turnIndex === thisTurnIndex &&
    pre?.speaker === speaker &&
    !injection;

  let prefetchedMp3: Uint8Array | null = null;
  const text: string =
    usePrefetchBuffer && pre ? pre.text : "";

  if (usePrefetchBuffer && pre) {
    prefetchedMp3 = Buffer.from(pre.audioBase64, "base64");
    await clearPrefetch(roomId);
  } else {
    if (pre) await clearPrefetch(roomId);
  }

  if (speaker === "A") delete room.pendingInterventionA;
  else delete room.pendingInterventionB;
  await saveRoom(room);

  let finalText = text;
  if (!usePrefetchBuffer) {
    const persona =
      speaker === "A"
        ? { name: room.sideA.name, systemPrompt: room.sideA.systemPrompt }
        : { name: room.sideB.name, systemPrompt: room.sideB.systemPrompt };

    try {
      const snapshot = await getRoom(roomId);
      finalText = await generateDebateTurn({
        topic: snapshot!.topic,
        side: speaker,
        personaName: persona.name,
        systemPrompt: persona.systemPrompt,
        moderatorInjection: injection,
        transcript: snapshot!.transcript,
      });
    } catch (e) {
      console.error("[debate] DeepSeek failed", e);
      finalText = `[GENERATION ERROR — ${
        speaker === "A" ? "Side A" : "Side B"
      } could not respond. Continuing.]`;
    }
  }

  try {
    await trigger(roomId, "turn-start", { speaker, text: finalText });

    const parts = finalText.split(/(\s+)/).filter((p) => p.length > 0);
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

  const fresh = await getRoom(roomId);
  if (!fresh) return { scheduleNext: false };

  fresh.transcript = [
    ...fresh.transcript,
    { side: speaker, content: finalText, at: Date.now() },
  ];
  fresh.currentTurnIndex += 1;

  const ended = fresh.currentTurnIndex >= fresh.totalTurns;
  fresh.debateStatus = ended ? "ended" : "between_turns";
  await saveRoom(fresh);

  try {
    if (
      prefetchedMp3?.length &&
      resolveTtsProvider() === "elevenlabs"
    ) {
      await streamMp3BufferToRoom({
        roomId,
        speaker,
        turnIndex: thisTurnIndex,
        buffer: prefetchedMp3,
      });
    } else {
      await scheduleTts({
        roomId,
        speaker,
        text: finalText,
        turnIndex: thisTurnIndex,
      });
    }
  } catch (e) {
    console.error("[debate] TTS failed", e);
  }

  if (ended) {
    await trigger(roomId, "debate-ended", {});
    return { scheduleNext: false };
  }

  if (prefetchEnabled()) {
    if (process.env.VERCEL) {
      waitUntil(runPrefetchNextTurn(roomId));
    } else {
      void runPrefetchNextTurn(roomId).catch((e) =>
        console.error("[prefetch]", e)
      );
    }
  }

  return { scheduleNext: true };
}
