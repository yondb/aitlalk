import { kv } from "@vercel/kv";
import type { RoomState } from "./types";

const mem = new Map<string, RoomState>();

function kvEnabled(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function getRoom(id: string): Promise<RoomState | null> {
  if (kvEnabled()) {
    const v = await kv.get<RoomState>(`aiarena:room:${id}`);
    return v ?? null;
  }
  return mem.get(id) ?? null;
}

export async function saveRoom(state: RoomState): Promise<void> {
  if (kvEnabled()) {
    await kv.set(`aiarena:room:${state.id}`, state);
  } else {
    mem.set(state.id, state);
  }
}
