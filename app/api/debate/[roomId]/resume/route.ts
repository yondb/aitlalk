import { waitUntil } from "@vercel/functions";
import { NextResponse } from "next/server";
import { chainAfterDelay, runTurn } from "@/lib/debate-step";
import { emitStateSync } from "@/lib/state-sync";
import { getRoom } from "@/lib/store";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only nudge active debates. runTurn itself also guards against duplicates.
  if (room.debateStatus === "lobby" || room.debateStatus === "ended") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { scheduleNext } = await runTurn(roomId);
  await emitStateSync(roomId);
  if (scheduleNext) {
    waitUntil(chainAfterDelay(roomId));
  }
  return NextResponse.json({ ok: true, scheduleNext });
}
