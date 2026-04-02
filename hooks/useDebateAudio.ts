"use client";

import Pusher from "pusher-js";
import { useEffect, useRef } from "react";
import { absApi } from "@/lib/client-api";

type Side = "A" | "B";

/** 0.5–2.0 w Web Speech API */
const BROWSER_TTS_RATE = (() => {
  const n = Number(process.env.NEXT_PUBLIC_TTS_RATE);
  return Number.isFinite(n) && n >= 0.5 && n <= 2 ? n : 1.2;
})();

function pickVoice(speaker: Side): SpeechSynthesisVoice | null {
  const list = typeof window !== "undefined" ? window.speechSynthesis.getVoices() : [];
  const pl = list.filter((v) => v.lang.toLowerCase().startsWith("pl"));
  const en = list.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = pl.length >= 2 ? pl : en.length >= 2 ? en : list;
  if (pool.length >= 2) return speaker === "A" ? pool[0]! : pool[1]!;
  return pool[0] ?? null;
}

function speakInBrowserQueued(speaker: Side, text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(speaker);
    if (v) u.voice = v;
    u.pitch = speaker === "A" ? 1.05 : 0.92;
    u.rate = BROWSER_TTS_RATE;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
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

type TLine = { side: Side; content: string };

async function fetchTranscript(roomId: string): Promise<TLine[]> {
  const r = await fetch(absApi(`/api/rooms/${encodeURIComponent(roomId)}?m=n`), {
    headers: { "X-Aitalk-View": "none" },
    cache: "no-store",
  });
  if (!r.ok) return [];
  const d = (await r.json()) as { transcript?: TLine[] };
  return Array.isArray(d.transcript) ? d.transcript : [];
}

function ensureVoicesReady(): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    if (window.speechSynthesis.getVoices().length > 0) {
      resolve();
      return;
    }
    const onVoices = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    window.setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      resolve();
    }, 1500);
  });
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
    const acc: Uint8Array[] = [];
    let accTurn: number | null = null;
    let chain = Promise.resolve();
    let activeAudio: HTMLAudioElement | null = null;

    const enqueue = (fn: () => Promise<void>) => {
      chain = chain.then(fn).catch(() => {});
    };

    async function speakGapIfNeeded(beforeTurnIndex: number) {
      const last = lastPlayedTurnRef.current;
      if (beforeTurnIndex <= last + 1) return;
      const lines = await fetchTranscript(rid);
      for (let i = last + 1; i < beforeTurnIndex; i++) {
        const line = lines[i];
        if (line) await speakInBrowserQueued(line.side, line.content);
      }
      lastPlayedTurnRef.current = beforeTurnIndex - 1;
    }

    const onChunk = (data: {
      seq: number;
      data: string;
      turnIndex?: number;
    }) => {
      const ti = data.turnIndex ?? accTurn ?? 0;
      if (accTurn !== null && ti !== accTurn) {
        acc.length = 0;
      }
      accTurn = ti;
      acc[data.seq] = decodeChunk(data.data);
    };

    const onEnd = (data: { speaker: Side; turnIndex?: number }) => {
      const turnIndex = data.turnIndex ?? accTurn ?? 0;
      const ordered = acc.filter((x): x is Uint8Array => Boolean(x));
      acc.length = 0;
      accTurn = null;

      if (!ordered.length) return;

      const merged = mergeChunks(ordered);
      const blob = new Blob([merged as BlobPart], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      enqueue(async () => {
        await ensureVoicesReady();
        await speakGapIfNeeded(turnIndex);
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
          audio.addEventListener("error", done, { once: true });
          audio.play().catch(done);
        });
      });
    };

    const onBrowserTts = (data: {
      speaker: Side;
      text: string;
      turnIndex?: number;
    }) => {
      const turnIndex = data.turnIndex ?? lastPlayedTurnRef.current + 1;
      enqueue(async () => {
        await ensureVoicesReady();
        await speakGapIfNeeded(turnIndex);
        await speakInBrowserQueued(data.speaker, data.text);
        lastPlayedTurnRef.current = turnIndex;
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
    channel.bind("browser-tts", onBrowserTts);

    return () => {
      document.removeEventListener("click", unlockOnce);
      document.removeEventListener("keydown", unlockOnce);
      channel.unbind("audio-chunk", onChunk);
      channel.unbind("audio-end", onEnd);
      channel.unbind("browser-tts", onBrowserTts);
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
