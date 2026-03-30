"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { XFilesShell } from "@/components/XFilesShell";

function CreatedInner() {
  const sp = useSearchParams();
  const room = sp.get("room") || "";

  const base =
    typeof window !== "undefined" ? window.location.origin : "";

  const modA = `${base}/mod/a/${room}`;
  const modB = `${base}/mod/b/${room}`;
  const stream = `${base}/stream/${room}`;

  return (
    <XFilesShell
      title="Room Provisioned"
      fileNo={`XB-${room.toUpperCase()}`}
      footer={
        <span>
          Distribute moderator links through a secure channel. Stream URL is
          read-only.
        </span>
      }
    >
      <p className="text-sm text-arena-paper/80">
        Room <span className="text-arena-matrix">{room}</span> is ready. Open
        moderator views, then start from Mod A.
      </p>

      <div className="mt-6 space-y-3 rounded border border-arena-border bg-arena-panel/70 p-4 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-arena-matrix/70">
            Moderator A
          </p>
          <Link className="break-all text-arena-alert underline" href={modA}>
            {modA}
          </Link>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-arena-matrix/70">
            Moderator B
          </p>
          <Link className="break-all text-arena-alert underline" href={modB}>
            {modB}
          </Link>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-arena-matrix/70">
            OBS / Stream overlay
          </p>
          <Link className="break-all text-arena-matrix underline" href={stream}>
            {stream}
          </Link>
        </div>
      </div>

      <div className="mt-6 text-[11px] text-arena-paper/50">
        ████████ · If deployment URL changes, copy these links from the browser
        address bar after navigation · ████████
      </div>
    </XFilesShell>
  );
}

export default function CreatedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-arena-bg p-8 font-mono text-arena-matrix">
          Loading secure links…
        </div>
      }
    >
      <CreatedInner />
    </Suspense>
  );
}
