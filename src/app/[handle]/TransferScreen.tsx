"use client";

import { useEffect, useState } from "react";
import { fmtBytes } from "@/lib/format";

export type TransferFile = { name: string; size: number; progress: number; state: "waiting" | "sending" | "sent" | "failed" };

/** "About 12 seconds left", from the real upload speed so far. */
function timeLeft(sent: number, total: number, startedAt: number) {
  const secs = (Date.now() - startedAt) / 1000;
  if (sent <= 0 || secs < 2) return "Starting…";
  const left = (total - sent) / (sent / secs);
  if (left < 5) return "Almost done";
  if (left < 60) return `About ${Math.round(left / 5) * 5} seconds left`;
  const mins = Math.round(left / 60);
  return `About ${mins} minute${mins === 1 ? "" : "s"} left`;
}

/**
 * Upload progress, in the place the form was: the receiver, the file in flight, one bar that fills as bytes land,
 * the time left, and the one thing the sender can do (cancel). Nothing else moves. The bar's width is the only
 * animation, and it exists to show the system working between progress events.
 */
export function TransferScreen({ receiverName, callout, files, startedAt, onCancel }: {
  receiverName: string;
  handle?: string;
  callout?: string | null;
  files: TransferFile[];
  startedAt: number;
  onCancel: () => void;
}) {
  // Re-render every second so the time estimate moves even between progress events.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const total = files.reduce((n, f) => n + f.size, 0);
  const sent = files.reduce((n, f) => n + (f.state === "sent" ? f.size : f.state === "sending" ? f.size * f.progress : 0), 0);
  const pct = total ? Math.min(100, Math.floor((sent / total) * 100)) : 0;
  const current = files.find((f) => f.state === "sending") ?? files.find((f) => f.state === "waiting") ?? files[files.length - 1];
  const many = files.length > 1;
  const doneCount = files.filter((f) => f.state === "sent").length;

  return (
    <section aria-live="polite" aria-label="Upload progress" className="motion-safe:starting:translate-y-1 flex flex-col gap-5 transition-[opacity,translate] duration-200 ease-[var(--ease-out)] starting:opacity-0">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Sending to {receiverName}{callout ? ` · ${callout}` : ""}</p>
        <h2 className="truncate text-[22px] font-bold leading-7 text-bone">{current?.name}</h2>
        <p className="text-[13px] text-mute">{many ? `Track ${Math.min(doneCount + 1, files.length)} of ${files.length} · ` : ""}{fmtBytes(sent)} of {fmtBytes(total)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div role="progressbar" aria-label="Upload progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-lime transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        <div className="flex items-baseline justify-between gap-3 text-[12px] text-dim tnum">
          <span>{timeLeft(sent, total, startedAt)}</span>
          <span>{pct}%</span>
        </div>
      </div>

      {many && (
        <ol className="divide-y divide-line border-y border-line text-[13px]">
          {files.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-3 py-2.5">
              <span className={`truncate ${f.state === "sent" ? "text-mute" : "text-bone"}`}>{f.name}</span>
              <span className={`shrink-0 text-[12px] ${f.state === "sent" ? "text-lime" : f.state === "failed" ? "text-danger" : "text-dim"}`}>
                {f.state === "sent" ? "Sent" : f.state === "sending" ? `${Math.round(f.progress * 100)}%` : f.state === "failed" ? "Failed" : "Waiting"}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-dim">Keep this page open until it&apos;s sent.</p>
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}
