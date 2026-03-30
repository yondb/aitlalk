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
  const { searchParams } = new URL(req.url);
  const mask = searchParams.get("mask");
  const m =
    mask === "mod-a" ? "mod-a" : mask === "mod-b" ? "mod-b" : "none";
  return NextResponse.json(publicRoom(room, m));
}
