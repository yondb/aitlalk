import { waitUntil } from "@vercel/functions";
import { NextResponse } from "next/server";
import { chainAfterDelay, runTurn } from "@/lib/debate-step";
import { emitStateSync } from "@/lib/state-sync";
import { getRoom, saveRoom } from "@/lib/store";

export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  const body = (await req.json().catch(() => ({}))) as { moderator?: string };
  if (body.moderator !== "A") {
    return NextResponse.json(
      { error: "Only moderator A can start the debate" },
      { status: 403 }
    );
  }

  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.debateStatus !== "lobby") {
    return NextResponse.json({ error: "Debate already started or ended" }, { status: 400 });
  }

  room.debateStatus = "between_turns";
  room.currentTurnIndex = 0;
  await saveRoom(room);
  await emitStateSync(roomId);

  const { scheduleNext } = await runTurn(roomId);
  await emitStateSync(roomId);

  if (scheduleNext) {
    waitUntil(chainAfterDelay(roomId));
  }

  return NextResponse.json({ ok: true });
}
