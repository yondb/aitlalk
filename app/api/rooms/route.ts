import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { saveRoom } from "@/lib/store";
import type { RoomState } from "@/lib/types";
import { MAX_INTERVENTIONS } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    topic?: string;
    sideAName?: string;
    sideASystem?: string;
    sideBName?: string;
    sideBSystem?: string;
    rounds?: number;
  };

  const topic = String(body.topic ?? "").trim();
  const sideAName = String(body.sideAName ?? "").trim();
  const sideASystem = String(body.sideASystem ?? "").trim();
  const sideBName = String(body.sideBName ?? "").trim();
  const sideBSystem = String(body.sideBSystem ?? "").trim();
  const rounds = Number(body.rounds);

  if (!topic || !sideAName || !sideASystem || !sideBName || !sideBSystem) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!Number.isInteger(rounds) || rounds < 3 || rounds > 8) {
    return NextResponse.json({ error: "Rounds must be 3–8" }, { status: 400 });
  }

  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const totalTurns = rounds * 2;

  const room: RoomState = {
    id,
    topic,
    sideA: { name: sideAName, systemPrompt: sideASystem },
    sideB: { name: sideBName, systemPrompt: sideBSystem },
    rounds,
    totalTurns,
    transcript: [],
    debateStatus: "lobby",
    currentTurnIndex: 0,
    generationLocked: false,
    interventionsRemainingA: MAX_INTERVENTIONS,
    interventionsRemainingB: MAX_INTERVENTIONS,
    createdAt: Date.now(),
  };

  await saveRoom(room);
  return NextResponse.json({ roomId: id });
}
