import { NextResponse } from "next/server";
import { publicRoom } from "@/lib/room-public";
import { getRoom } from "@/lib/store";

export async function GET(
  req: Request,
  { params }: { params: { roomId: string } }
) {
  const roomId = params.roomId;
  const room = await getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const h = req.headers.get("x-aitalk-view")?.trim();
  let view: "mod-a" | "mod-b" | "none" = "none";
  if (h === "mod-a" || h === "mod-b" || h === "none") {
    view = h;
  } else {
    const { searchParams } = new URL(req.url);
    const mask = searchParams.get("mask");
    const short = searchParams.get("m");
    if (mask === "mod-a" || mask === "mod-b") view = mask;
    else if (short === "a") view = "mod-a";
    else if (short === "b") view = "mod-b";
    else if (short === "n") view = "none";
  }
  return NextResponse.json(publicRoom(room, view));
}
