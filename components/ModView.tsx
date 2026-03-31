"use client";

import Pusher from "pusher-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebateAudio } from "@/hooks/useDebateAudio";
import { absApi } from "@/lib/client-api";
import { XFilesShell } from "./XFilesShell";

type Side = "A" | "B";

type TLine = { side: Side; content: string; at: number };

type RoomApi = {
  topic: string;
  sideA: { name: string; systemPrompt: string };
  sideB: { name: string; systemPrompt: string };
  debateStatus: "lobby" | "between_turns" | "ended";
  currentTurnIndex: number;
  totalTurns: number;
  transcript: TLine[];
  interventionsRemainingA: number;
  interventionsRemainingB: number;
  generationLocked: boolean;
  pendingInterventionA?: string;
  pendingInterventionB?: string;
};

export function ModView({
  roomId,
  mod,
}: {
  roomId: string;
  mod: "a" | "b";
}) {
  const mySide: Side = mod === "a" ? "A" : "B";
  const mask = mod === "a" ? "mod-a" : "mod-b";

  const [room, setRoom] = useState<RoomApi | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [interveneOpen, setInterveneOpen] = useState(false);
  const [interveneText, setInterveneText] = useState("");
  const [intervening, setIntervening] = useState(false);
  const [stamp, setStamp] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<Side | null>(null);

  useDebateAudio(roomId);

  const refresh = useCallback(async () => {
    const m = mask === "mod-a" ? "a" : "b";
    const res = await fetch(
      absApi(`/api/rooms/${encodeURIComponent(roomId)}?m=${m}`),
      {
        headers: { "X-Aitalk-View": mask },
        cache: "no-store",
      }
    );
    if (res.status === 404) {
      setLoadError(
        "Pokój nie istnieje. Dodaj na Vercelu zmienną REDIS_URL (cały redis://... z Storage) i Redeploy. Potem /setup na tej samej domenie co Mod A."
      );
      return;
    }
    if (!res.ok) {
      setLoadError(`Błąd serwera (${res.status})`);
      return;
    }
    const data = (await res.json()) as RoomApi;
    setRoom(data);
  }, [roomId, mask]);

  useEffect(() => {
    refresh().catch(() => setLoadError("Failed to load room"));
  }, [refresh]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, { cluster });
    const channel = pusher.subscribe(`debate-${roomId}`);

    const onTurnStart = (data: { speaker: Side; text: string }) => {
      setActiveSpeaker(data.speaker);
      setRoom((r) =>
        r
          ? {
              ...r,
              transcript: [
                ...r.transcript,
                { side: data.speaker, content: data.text, at: Date.now() },
              ],
            }
          : r
      );
    };

    const onState = (data: {
      debateStatus: RoomApi["debateStatus"];
      currentTurnIndex: number;
      totalTurns: number;
      interventionsRemainingA: number;
      interventionsRemainingB: number;
      generationLocked: boolean;
    }) => {
      setRoom((r) =>
        r
          ? {
              ...r,
              debateStatus: data.debateStatus,
              currentTurnIndex: data.currentTurnIndex,
              totalTurns: data.totalTurns,
              interventionsRemainingA: data.interventionsRemainingA,
              interventionsRemainingB: data.interventionsRemainingB,
              generationLocked: data.generationLocked,
            }
          : r
      );
      if (!data.generationLocked) setActiveSpeaker(null);
    };

    const onIv = (data: { side: Side }) => {
      if (data.side === mySide) {
        setStamp(true);
        setTimeout(() => setStamp(false), 1200);
      }
    };

    channel.bind("turn-start", onTurnStart);
    channel.bind("state", onState);
    channel.bind("intervention-used", onIv);
    channel.bind("debate-ended", () => {
      refresh().catch(() => {});
    });

    return () => {
      channel.unbind("turn-start", onTurnStart);
      channel.unbind("state", onState);
      channel.unbind("intervention-used", onIv);
      channel.unbind("debate-ended");
      pusher.unsubscribe(`debate-${roomId}`);
      pusher.disconnect();
    };
  }, [roomId, mySide, refresh]);

  const remaining = mySide === "A" ? room?.interventionsRemainingA : room?.interventionsRemainingB;

  const canIntervene =
    room &&
    room.debateStatus === "between_turns" &&
    !room.generationLocked &&
    (remaining ?? 0) > 0;

  const statusLine = useMemo(() => {
    if (!room) return "LOADING…";
    if (room.debateStatus === "lobby") return "AWAITING START (MOD A)";
    if (room.debateStatus === "ended") return "DEBATE ENDED";
    if (room.generationLocked) return "TRANSMITTING — SIGNAL ACQUIRED";
    return "AWAITING RESPONSE — INTERVENTION WINDOW OPEN";
  }, [room]);

  const nextSpeaker: Side | null = room
    ? room.currentTurnIndex % 2 === 0
      ? "A"
      : "B"
    : null;

  async function startDebate() {
    setStarting(true);
    try {
      const res = await fetch(
        absApi(`/api/debate/${encodeURIComponent(roomId)}/start`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moderator: "A" }),
        }
      );
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(
            "Start: serwer nie widzi pokoju (404). W Vercelu dodaj REDIS_URL (redis://... z Storage), Redeploy, potem nowy pokój z /setup na tej samej domenie."
          );
        }
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Start failed");
      }
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Start failed");
    } finally {
      setStarting(false);
    }
  }

  async function submitIntervention() {
    if (!interveneText.trim()) return;
    setIntervening(true);
    try {
      const res = await fetch(
        absApi(`/api/debate/${encodeURIComponent(roomId)}/intervene`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ side: mySide, text: interveneText.trim() }),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Intervention failed");
      }
      setInterveneText("");
      setInterveneOpen(false);
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Intervention failed");
    } finally {
      setIntervening(false);
    }
  }

  const fileNo = `XB-${roomId.toUpperCase()}`;

  return (
    <XFilesShell
      title={`Moderator ${mySide} — Live Feed`}
      fileNo={fileNo}
      footer={
        <span>
          Unauthorized monitoring prohibited. Audio may be mirrored to stream
          relay.
        </span>
      }
    >
      {loadError ? (
        <p className="text-arena-alert">{loadError}</p>
      ) : null}

      {stamp ? (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-start justify-center pt-24">
          <div className="flash-intervention rounded border border-arena-alert bg-black/70 px-6 py-3 text-sm uppercase tracking-[0.35em] text-arena-alert">
            Intervention logged
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded border border-arena-border bg-arena-panel/90 p-4 glow-green">
          <p className="text-[10px] uppercase tracking-[0.4em] text-arena-matrix/80">
            Status
          </p>
          <p className="mt-2 text-sm text-arena-matrix">{statusLine}</p>
          <p className="mt-3 text-[11px] text-arena-paper/80">
            Next scheduled speaker:{" "}
            <span className="text-arena-alert">
              {room && room.debateStatus !== "lobby" && room.debateStatus !== "ended"
                ? nextSpeaker === "A"
                  ? room.sideA.name
                  : room.sideB.name
                : "—"}
            </span>
          </p>
          {room?.generationLocked && activeSpeaker ? (
            <p className="mt-2 text-[11px] text-arena-alert">
              On air:{" "}
              {activeSpeaker === "A" ? room.sideA.name : room.sideB.name}
            </p>
          ) : null}
        </section>

        <section
          className={`rounded border border-arena-border bg-arena-panel/90 p-4 ${
            room?.generationLocked ? "pulse-active" : ""
          }`}
        >
          <p className="text-[10px] uppercase tracking-[0.4em] text-arena-matrix/80">
            Intervention budget ({mySide})
          </p>
          <p className="mt-2 text-2xl text-arena-matrix">
            {remaining ?? "—"}
            <span className="text-base text-arena-paper/60"> / 3</span>
          </p>
          {mod === "a" && room?.debateStatus === "lobby" ? (
            <button
              type="button"
              onClick={startDebate}
              disabled={starting}
              className="mt-4 w-full border border-arena-alert bg-black/40 px-3 py-2 text-xs uppercase tracking-widest text-arena-alert hover:bg-arena-alert/10 disabled:opacity-40"
            >
              {starting ? "Starting…" : "Start debate"}
            </button>
          ) : null}

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={!canIntervene || interveneOpen}
              onClick={() => setInterveneOpen(true)}
              className="border border-arena-border px-3 py-2 text-xs uppercase tracking-widest text-arena-paper hover:border-arena-matrix hover:text-arena-matrix disabled:cursor-not-allowed disabled:opacity-30"
            >
              Intervene
            </button>
            {interveneOpen ? (
              <div className="rounded border border-arena-border bg-black/40 p-3">
                <label className="text-[10px] uppercase tracking-widest text-arena-paper/60">
                  Direction for your bot (next turn only)
                </label>
                <textarea
                  value={interveneText}
                  onChange={(e) => setInterveneText(e.target.value)}
                  rows={3}
                  className="mt-2 w-full resize-none border border-arena-border bg-arena-bg px-2 py-2 text-sm text-arena-matrix outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={submitIntervention}
                    disabled={intervening}
                    className="border border-arena-alert px-3 py-1 text-[11px] uppercase tracking-widest text-arena-alert"
                  >
                    {intervening ? "Sending…" : "Transmit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInterveneOpen(false)}
                    className="border border-arena-border px-3 py-1 text-[11px] uppercase tracking-widest text-arena-paper/70"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded border border-arena-border bg-arena-panel/80 p-4">
        <div className="flex items-center justify-between gap-4 border-b border-arena-border pb-2">
          <p className="text-[10px] uppercase tracking-[0.4em] text-arena-matrix/80">
            Full transcript
          </p>
          <p className="text-[10px] text-arena-paper/50">
            ████████ · REDACTED DIVIDER · ████████
          </p>
        </div>
        <div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pr-2 text-sm leading-relaxed">
          {room?.transcript?.length ? (
            room.transcript.map((line, i) => (
              <div
                key={`${line.at}-${i}`}
                className={`rounded border px-3 py-2 ${
                  line.side === "A"
                    ? "border-arena-matrix/40 bg-black/30"
                    : "border-arena-paper/20 bg-black/20"
                }`}
              >
                <div className="text-[10px] uppercase tracking-widest text-arena-alert/90">
                  {line.side === "A" ? room.sideA.name : room.sideB.name}
                </div>
                <p className="mt-1 text-arena-paper">{line.content}</p>
              </div>
            ))
          ) : (
            <p className="text-arena-paper/50">No transmissions yet.</p>
          )}
        </div>
      </section>

      {room?.debateStatus === "ended" ? (
        <div className="mt-6 rounded border border-arena-alert/60 bg-black/50 p-4 text-center text-arena-alert">
          DEBATE ENDED — ARCHIVE LOCKED
        </div>
      ) : null}

      {room?.generationLocked ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded border border-arena-matrix/50 bg-black/80 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-arena-matrix">
          AI processing<span className="animate-pulse">…</span>
        </div>
      ) : null}
    </XFilesShell>
  );
}
