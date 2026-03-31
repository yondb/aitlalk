"use client";

import Pusher from "pusher-js";
import { useEffect, useMemo, useState } from "react";
import { useDebateAudio } from "@/hooks/useDebateAudio";
import { absApi } from "@/lib/client-api";

type Side = "A" | "B";

type RoomApi = {
  sideA: { name: string };
  sideB: { name: string };
  debateStatus: "lobby" | "between_turns" | "ended";
  interventionsRemainingA: number;
  interventionsRemainingB: number;
  generationLocked: boolean;
};

const ROOM_HELP_PL =
  "Pokój nie został znaleziony. Utwórz go na /setup na tej samej domenie. Na Vercelu włącz Redis (Storage → Create Database → Upstash) i dodaj KV_REST_API_URL oraz KV_REST_API_TOKEN w Environment Variables — bez tego pokoje nie są współdzielone między serwerami. Debata startuje z widoku Moderator A (przycisk Start), nie ze streamu.";

export function StreamOverlay({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<RoomApi | null>(null);
  const [speaker, setSpeaker] = useState<Side | null>(null);
  const [fullText, setFullText] = useState("");
  const [visible, setVisible] = useState("");
  const [flash, setFlash] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useDebateAudio(roomId);

  useEffect(() => {
    setFetchError(null);
    fetch(absApi(`/api/rooms/${encodeURIComponent(roomId)}?m=n`), {
      headers: { "X-Aitalk-View": "none" },
      cache: "no-store",
    })
      .then(async (r) => {
        if (r.status === 404) {
          setFetchError(ROOM_HELP_PL);
          return;
        }
        if (!r.ok) {
          setFetchError(`Błąd ładowania pokoju (${r.status}).`);
          return;
        }
        const d = (await r.json()) as RoomApi;
        setRoom(d);
      })
      .catch(() => setFetchError("Nie udało się połączyć z API."));
  }, [roomId]);

  useEffect(() => {
    if (!fullText) {
      setVisible("");
      return;
    }
    let i = 0;
    setVisible("");
    const id = window.setInterval(() => {
      i += 1;
      setVisible(fullText.slice(0, i));
      if (i >= fullText.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [fullText]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channel = pusher.subscribe(`debate-${roomId}`);

    const onTurnStart = (data: { speaker: Side; text: string }) => {
      setSpeaker(data.speaker);
      setFullText(data.text);
    };

    const onState = (data: {
      interventionsRemainingA: number;
      interventionsRemainingB: number;
      generationLocked: boolean;
      debateStatus: RoomApi["debateStatus"];
    }) => {
      setRoom((r) =>
        r
          ? {
              ...r,
              interventionsRemainingA: data.interventionsRemainingA,
              interventionsRemainingB: data.interventionsRemainingB,
              generationLocked: data.generationLocked,
              debateStatus: data.debateStatus,
            }
          : r
      );
    };

    const onIv = () => {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 700);
    };

    channel.bind("turn-start", onTurnStart);
    channel.bind("state", onState);
    channel.bind("intervention-used", onIv);

    return () => {
      channel.unbind("turn-start", onTurnStart);
      channel.unbind("state", onState);
      channel.unbind("intervention-used", onIv);
      pusher.unsubscribe(`debate-${roomId}`);
      pusher.disconnect();
    };
  }, [roomId]);

  const speakerName = useMemo(() => {
    if (!room || !speaker) return "—";
    return speaker === "A" ? room.sideA.name : room.sideB.name;
  }, [room, speaker]);

  const status = useMemo(() => {
    if (!room) return "SIGNAL ACQUIRED";
    if (room.debateStatus === "ended") return "SESSION CLOSED";
    if (room.generationLocked) return "TRANSMITTING";
    return "AWAITING RESPONSE";
  }, [room]);

  return (
    <div className="relative min-h-screen bg-arena-bg text-arena-paper scanlines vignette crt-flicker">
      <div className="pointer-events-none absolute left-6 top-6 z-30 text-[11px] uppercase tracking-[0.45em] text-arena-matrix/80">
        Top Secret · Stream Relay
      </div>
      <div className="pointer-events-none absolute right-6 top-6 z-30 text-[11px] text-arena-matrix/80">
        FILE NO: XB-{roomId.toUpperCase()}
      </div>

      {flash ? (
        <div className="pointer-events-none absolute inset-0 z-20 bg-arena-alert/15" />
      ) : null}

      {fetchError ? (
        <div className="relative z-40 mx-auto max-w-4xl px-6 pt-24 text-sm leading-relaxed text-arena-alert">
          <p className="rounded border border-arena-alert/60 bg-black/80 p-4">
            {fetchError}
          </p>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-10 pb-10 pt-16">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-arena-border pb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-arena-matrix/70">
              Active speaker
            </p>
            <p
              className={`mt-2 text-4xl uppercase tracking-[0.12em] text-arena-alert ${
                room?.generationLocked ? "pulse-active" : ""
              }`}
            >
              {speakerName}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.45em] text-arena-matrix/70">
              Status
            </p>
            <p className="mt-2 text-sm text-arena-matrix">{status}</p>
          </div>
        </div>

        <div className="mt-8 grid flex-1 gap-6 md:grid-cols-[1fr_280px]">
          <div className="relative rounded border border-arena-border bg-arena-panel/70 p-6 glow-green">
            <div className="absolute left-4 top-4 h-16 w-14 border border-arena-border bg-black/50 text-[9px] text-arena-paper/40">
              <span className="block p-1">PHOTO</span>
              <span className="block p-1">[REDACTED]</span>
            </div>
            <div className="pl-24">
              <p className="text-[10px] uppercase tracking-[0.4em] text-arena-matrix/70">
                Live transcript (primary)
              </p>
              <p className="mt-4 min-h-[200px] text-xl leading-relaxed text-arena-paper">
                {visible || "…"}
                <span className="ml-1 inline-block h-5 w-2 animate-pulse bg-arena-matrix/70 align-middle" />
              </p>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded border border-arena-border bg-black/40 p-4">
              <p className="text-[10px] uppercase tracking-[0.4em] text-arena-matrix/70">
                Interventions remaining
              </p>
              <p className="mt-3 text-sm text-arena-paper">
                A:{" "}
                <span className="text-arena-matrix">
                  {room?.interventionsRemainingA ?? "—"}
                </span>{" "}
                / 3
              </p>
              <p className="mt-2 text-sm text-arena-paper">
                B:{" "}
                <span className="text-arena-matrix">
                  {room?.interventionsRemainingB ?? "—"}
                </span>{" "}
                / 3
              </p>
            </div>
            <div className="rounded border border-dashed border-arena-border/80 bg-black/30 p-4 text-[10px] leading-relaxed text-arena-paper/50">
              ████████ · DO NOT DISTRIBUTE · ████████
              <br />
              Unauthorized observation is a federal offense.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
