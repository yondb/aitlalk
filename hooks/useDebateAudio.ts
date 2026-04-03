"use client";

import Pusher from "pusher-js";
import { useEffect, useRef } from "react";

type Side = "A" | "B";

const CLIENT_WANTS_BROWSER_TTS =
  process.env.NEXT_PUBLIC_TTS_PROVIDER === "browser" ||
  process.env.NEXT_PUBLIC_TTS_PROVIDER === "web";

/** Produkcja: tylko ElevenLabs (MP3). Web Speech wyłącznie przy NEXT_PUBLIC_TTS_PROVIDER=browser. */

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
  const lastPlayedTurnRef = useRef(-1);

  useEffect(() => {
    if (!roomId) return;
    const rid = roomId;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channel = pusher.subscribe(`debate-${rid}`);
    const acc = new Map<number, Uint8Array>();
    let accTurn: number | null = null;
    let chain = Promise.resolve();
    let activeAudio: HTMLAudioElement | null = null;

    const enqueue = (fn: () => Promise<void>) => {
      chain = chain.then(fn).catch(() => {});
    };

    const onChunk = (data: {
      seq: number;
      data: string;
      turnIndex?: number;
    }) => {
      const ti = data.turnIndex ?? accTurn ?? 0;
      if (accTurn !== null && ti !== accTurn) {
        acc.clear();
      }
      accTurn = ti;
      acc.set(data.seq, decodeChunk(data.data));
    };

    const onEnd = (data: { turnIndex?: number }) => {
      const turnIndex = data.turnIndex ?? accTurn ?? 0;
      const seqs = Array.from(acc.keys()).sort((a, b) => a - b);
      const ordered = seqs.map((s) => acc.get(s)).filter((x): x is Uint8Array => Boolean(x));
      acc.clear();
      accTurn = null;

      if (!ordered.length) return;

      const merged = mergeChunks(ordered);
      const blob = new Blob([merged as BlobPart], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      enqueue(async () => {
        await new Promise<void>((resolve) => {
          const audio = new Audio(url);
          activeAudio = audio;
          const done = () => {
            if (activeAudio === audio) activeAudio = null;
            URL.revokeObjectURL(url);
            lastPlayedTurnRef.current = turnIndex;
            resolve();
          };
          audio.addEventListener("ended", done, { once: true });
          audio.addEventListener("error", () => {
            console.warn("[audio] mp3 playback error");
            done();
          }, { once: true });
          audio.play().catch(done);
        });
      });
    };

    const unlockOnce = () => {
      try {
        const a = new Audio();
        a.play().catch(() => {});
      } catch {}
    };
    document.addEventListener("click", unlockOnce, { once: true });
    document.addEventListener("keydown", unlockOnce, { once: true });

    channel.bind("audio-chunk", onChunk);
    channel.bind("audio-end", onEnd);

    let onBrowserTts: ((data: { speaker: Side; text: string }) => void) | undefined;
    if (CLIENT_WANTS_BROWSER_TTS) {
      const speak = (speaker: Side, text: string) =>
        new Promise<void>((resolve) => {
          if (!("speechSynthesis" in window)) {
            resolve();
            return;
          }
          const u = new SpeechSynthesisUtterance(text);
          u.rate = 1.15;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          window.speechSynthesis.speak(u);
        });
      onBrowserTts = (data: { speaker: Side; text: string }) => {
        enqueue(async () => {
          await speak(data.speaker, data.text);
        });
      };
      channel.bind("browser-tts", onBrowserTts);
    }

    return () => {
      document.removeEventListener("click", unlockOnce);
      document.removeEventListener("keydown", unlockOnce);
      channel.unbind("audio-chunk", onChunk);
      channel.unbind("audio-end", onEnd);
      if (onBrowserTts) channel.unbind("browser-tts", onBrowserTts);
      try {
        window.speechSynthesis.cancel();
      } catch {}
      if (activeAudio) {
        try {
          activeAudio.pause();
          activeAudio.currentTime = 0;
        } catch {}
        activeAudio = null;
      }
      lastPlayedTurnRef.current = -1;
      pusher.unsubscribe(`debate-${rid}`);
      pusher.disconnect();
    };
  }, [roomId]);
}
