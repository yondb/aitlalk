"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { XFilesShell } from "@/components/XFilesShell";

export default function SetupPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [sideAName, setSideAName] = useState("");
  const [sideASystem, setSideASystem] = useState("");
  const [sideBName, setSideBName] = useState("");
  const [sideBSystem, setSideBSystem] = useState("");
  const [rounds, setRounds] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          sideAName,
          sideASystem,
          sideBName,
          sideBSystem,
          rounds,
        }),
      });
      const data = (await res.json()) as { roomId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create room");
      if (!data.roomId) throw new Error("No room id");
      router.push(
        `/setup/created?room=${encodeURIComponent(data.roomId)}`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <XFilesShell
      title="Pre-Debate Configuration"
      fileNo="XB-NEW"
      footer={
        <span>
          Configuration is written to secure storage. Treat room links as
          credentials.
        </span>
      }
    >
      <p className="mb-6 text-sm text-arena-paper/80">
        Define the topic, personas, and round count. Generate a room ID, then
        open moderator A/B links on separate machines before going live.
      </p>

      {err ? (
        <p className="mb-4 border border-arena-alert/60 bg-black/40 px-3 py-2 text-sm text-arena-alert">
          {err}
        </p>
      ) : null}

      <form
        onSubmit={createRoom}
        className="space-y-5 rounded border border-arena-border bg-arena-panel/70 p-5"
      >
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.35em] text-arena-matrix/80">
            Debate topic
          </span>
          <input
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="mt-2 w-full border border-arena-border bg-arena-bg px-3 py-2 text-sm text-arena-matrix outline-none"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded border border-arena-border/80 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.35em] text-arena-alert/90">
              Side A
            </p>
            <input
              required
              placeholder="Display name"
              value={sideAName}
              onChange={(e) => setSideAName(e.target.value)}
              className="mt-3 w-full border border-arena-border bg-arena-bg px-3 py-2 text-sm text-arena-paper outline-none"
            />
            <textarea
              required
              placeholder="System prompt / persona"
              value={sideASystem}
              onChange={(e) => setSideASystem(e.target.value)}
              rows={4}
              className="mt-3 w-full resize-none border border-arena-border bg-arena-bg px-3 py-2 text-sm text-arena-paper outline-none"
            />
          </div>
          <div className="rounded border border-arena-border/80 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.35em] text-arena-alert/90">
              Side B
            </p>
            <input
              required
              placeholder="Display name"
              value={sideBName}
              onChange={(e) => setSideBName(e.target.value)}
              className="mt-3 w-full border border-arena-border bg-arena-bg px-3 py-2 text-sm text-arena-paper outline-none"
            />
            <textarea
              required
              placeholder="System prompt / persona"
              value={sideBSystem}
              onChange={(e) => setSideBSystem(e.target.value)}
              rows={4}
              className="mt-3 w-full resize-none border border-arena-border bg-arena-bg px-3 py-2 text-sm text-arena-paper outline-none"
            />
          </div>
        </div>

        <label className="block max-w-xs">
          <span className="text-[10px] uppercase tracking-[0.35em] text-arena-matrix/80">
            Rounds (3–8)
          </span>
          <input
            type="number"
            min={3}
            max={8}
            required
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            className="mt-2 w-full border border-arena-border bg-arena-bg px-3 py-2 text-sm text-arena-matrix outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="border border-arena-alert bg-black/50 px-6 py-2 text-xs uppercase tracking-[0.35em] text-arena-alert hover:bg-arena-alert/10 disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate room ID"}
        </button>
      </form>
    </XFilesShell>
  );
}
