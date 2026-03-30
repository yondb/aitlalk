import type { ReactNode } from "react";
import { LiveClock } from "./LiveClock";

export function XFilesShell({
  title,
  fileNo,
  children,
  footer,
}: {
  title: string;
  fileNo: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-arena-bg text-arena-paper crt-flicker">
      <div className="pointer-events-none fixed left-4 top-4 z-20 text-[10px] uppercase tracking-[0.35em] text-arena-matrix/70">
        Top Secret · Classified · Eyes Only
      </div>
      <div className="pointer-events-none fixed right-4 top-4 z-20 text-[10px] text-arena-matrix/80">
        <LiveClock />
      </div>
      <header className="border-b border-arena-border bg-arena-panel/80 px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-arena-matrix/70">
              Defense Intelligence Archive
            </p>
            <h1 className="mt-1 text-xl font-normal uppercase tracking-[0.2em] text-arena-matrix">
              {title}
            </h1>
          </div>
          <div className="text-right text-[11px] text-arena-paper/70">
            <div className="uppercase tracking-widest text-arena-alert/90">
              File Ref
            </div>
            <div className="mt-1 font-mono text-arena-paper">FILE NO: {fileNo}</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      {footer ? (
        <footer className="border-t border-arena-border px-6 py-3 text-[10px] text-arena-paper/50">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
