import Pusher from "pusher";
import type { Side } from "./types";

let pusherSingleton: Pusher | null = null;

export function getPusher(): Pusher | null {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster =
    process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) return null;
  if (!pusherSingleton) {
    pusherSingleton = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
  }
  return pusherSingleton;
}

export function channelName(roomId: string): string {
  return `debate-${roomId}`;
}

export async function trigger(
  roomId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const p = getPusher();
  if (!p) {
    console.warn("[pusher] missing config, skip event", event);
    return;
  }
  await p.trigger(channelName(roomId), event, data);
}

export type TurnStartPayload = { speaker: Side; text: string };
export type TurnChunkPayload = { speaker: Side; textChunk: string };
export type TurnEndPayload = { speaker: Side };
export type InterventionPayload = { side: Side; remaining: number };
export type AudioChunkPayload = {
  speaker: Side;
  seq: number;
  data: string;
};
export type AudioEndPayload = { speaker: Side };
