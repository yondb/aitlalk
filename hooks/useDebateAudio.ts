"use client";

import Pusher from "pusher-js";
import { useEffect } from "react";

type Side = "A" | "B";

function pickVoice(speaker: Side): SpeechSynthesisVoice | null {
  const list = typeof window !== "undefined" ? window.speechSynthesis.getVoices() : [];
  const pl = list.filter((v) => v.lang.toLowerCase().startsWith("pl"));
  const en = list.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = pl.length >= 2 ? pl : en.length >= 2 ? en : list;
  if (pool.length >= 2) return speaker === "A" ? pool[0]! : pool[1]!;
  return pool[0] ?? null;
}

function speakInBrowser(speaker: Side, text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(speaker);
  if (v) u.voice = v;
  u.pitch = speaker === "A" ? 1.05 : 0.92;
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
}

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

    const onBrowserTts = (data: { speaker: Side; text: string }) => {
      const run = () => speakInBrowser(data.speaker, data.text);
      if (window.speechSynthesis.getVoices().length) {
        run();
        return;
      }
      const once = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", once);
        run();
      };
      window.speechSynthesis.addEventListener("voiceschanged", once);
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
    channel.bind("browser-tts", onBrowserTts);

    return () => {
      channel.unbind("audio-chunk", onChunk);
      channel.unbind("audio-end", onEnd);
      channel.unbind("browser-tts", onBrowserTts);
      pusher.unsubscribe(`debate-${roomId}`);
      pusher.disconnect();
    };
  }, [roomId]);
}
