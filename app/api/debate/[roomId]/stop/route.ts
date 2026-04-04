import { NextResponse } from "next/server";
import { trigger } from "@/lib/pusher-server";
import { emitStateSync } from "@/lib/state-sync";
import { clearPrefetch } from "@/lib/prefetch-store";
import { getRoom, saveRoom } from "@/lib/store";

export async function POST(
  _req: Request,
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (room.debateStatus === "ended") {
    return NextResponse.json({ ok: true, alreadyEnded: true });
  }

  room.debateStatus = "ended";
  room.generationLocked = false;
  delete room.pendingInterventionA;
  delete room.pendingInterventionB;
  await saveRoom(room);
  await clearPrefetch(roomId);

  await emitStateSync(roomId);
  await trigger(roomId, "debate-ended", { forced: true });

  return NextResponse.json({ ok: true });
}
