import { NextResponse } from "next/server";
import { trigger } from "@/lib/pusher-server";
import { emitStateSync } from "@/lib/state-sync";
import { getRoom, saveRoom } from "@/lib/store";
import type { Side } from "@/lib/types";

export async function POST(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  const body = (await req.json()) as { side?: Side; text?: string };
  const side = body.side;
  const text = String(body.text ?? "").trim();

  if (side !== "A" && side !== "B") {
    return NextResponse.json({ error: "Invalid side" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Text required" }, { status: 400 });
  }

  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (room.debateStatus !== "between_turns" || room.generationLocked) {
    return NextResponse.json(
      { error: "Interventions only between turns" },
      { status: 400 }
    );
  }

  const remaining =
    side === "A" ? room.interventionsRemainingA : room.interventionsRemainingB;
  if (remaining <= 0) {
    return NextResponse.json({ error: "No interventions remaining" }, { status: 400 });
  }

  if (side === "A") {
    room.interventionsRemainingA -= 1;
    room.pendingInterventionA = text;
  } else {
    room.interventionsRemainingB -= 1;
    room.pendingInterventionB = text;
  }

  await saveRoom(room);

  await trigger(roomId, "intervention-used", {
    side,
    remaining: side === "A" ? room.interventionsRemainingA : room.interventionsRemainingB,
  });
  await emitStateSync(roomId);

  return NextResponse.json({ ok: true });
}
