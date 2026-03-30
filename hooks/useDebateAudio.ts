"use client";

import Pusher from "pusher-js";
import { useEffect } from "react";

function decodeChunk(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function mergeChunks(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function useDebateAudio(roomId: string | undefined) {
  useEffect(() => {
    if (!roomId) return;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channel = pusher.subscribe(`debate-${roomId}`);
    const acc: Uint8Array[] = [];

    const onChunk = (data: { seq: number; data: string }) => {
      acc[data.seq] = decodeChunk(data.data);
    };
    const onEnd = () => {
      const ordered = acc.filter((x): x is Uint8Array => Boolean(x));
      acc.length = 0;
      if (!ordered.length) return;
      const merged = mergeChunks(ordered);
      const blob = new Blob([merged as BlobPart], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().catch(() => {});
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), {
        once: true,
      });
    };

    channel.bind("audio-chunk", onChunk);
    channel.bind("audio-end", onEnd);

    return () => {
      channel.unbind("audio-chunk", onChunk);
      channel.unbind("audio-end", onEnd);
      pusher.unsubscribe(`debate-${roomId}`);
      pusher.disconnect();
    };
  }, [roomId]);
}
