import { waitUntil } from "@vercel/functions";
import { NextResponse } from "next/server";
import { chainAfterDelay, runTurn } from "@/lib/debate-step";
import { getInternalSecret } from "@/lib/public-url";
import { emitStateSync } from "@/lib/state-sync";

export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const { roomId } = params;
  const secret = req.headers.get("x-internal-secret");
  if (secret !== getInternalSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scheduleNext } = await runTurn(roomId);
  await emitStateSync(roomId);

  if (scheduleNext) {
    waitUntil(chainAfterDelay(roomId));
  }

  return NextResponse.json({ ok: true });
}
