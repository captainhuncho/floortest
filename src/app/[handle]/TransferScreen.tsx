"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Kit";

export type TransferFile = { name: string; size: number; progress: number; state: "waiting" | "sending" | "sent" | "failed" };

/** One file as the send steps show it (picked, sending, sent): icon, title, one line about it, and whatever sits on the right. */
export function FileRow({ title, meta, right, children }: { title: string; meta: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3 text-left">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-well text-mute">
        <Icon name="wave" className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[15px] font-semibold text-bone">{title}</p>
        <p className="text-[13px] leading-[18px] text-mute tnum">{meta}</p>
        {children}
      </div>
      {right}
    </div>
  );
}

/** "about 40 seconds left", from the real upload speed so far. */
function timeLeft(sent: number, total: number, startedAt: number) {
  const secs = (Date.now() - startedAt) / 1000;
  if (sent <= 0 || secs < 2) return "starting";
  const left = (total - sent) / (sent / secs);
  if (left < 5) return "almost done";
  if (left < 60) return `about ${Math.round(left / 5) * 5} seconds left`;
  const mins = Math.round(left / 60);
  return `about ${mins} minute${mins === 1 ? "" : "s"} left`;
}

/**
 * Upload progress, in the place the form was: who it's going to, the file in flight with one bar that fills as bytes
 * land, the time left, and the one thing the sender can do (cancel). Nothing else moves. The bar's fill (a scaleX, so
 * it stays on the compositor) is the only animation, and it exists to show the system working between progress events.
 * Screen readers hear milestones from the form's one status line, not every byte counted here.
 */
export function TransferScreen({ receiverName, files, startedAt, onCancel, retry, checking, className = "" }: {
  receiverName: string;
  /** Set while a dropped or stalled upload is being tried again by itself. */
  retry?: { attempt: number; of: number };
  /** True while the file has landed and the virus check runs (up to a minute when the scanner is waking). */
  checking?: boolean;
  handle?: string;
  callout?: string | null;
  files: TransferFile[];
  startedAt: number;
  onCancel: () => void;
  className?: string;
}) {
  // Re-render every second so the time estimate moves even between progress events.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const total = files.reduce((n, f) => n + f.size, 0);
  const sent = files.reduce((n, f) => n + (f.state === "sent" ? f.size : f.state === "sending" ? f.size * f.progress : 0), 0);
  // The bar follows the exact fraction; the number beside it is the floored percent.
  const frac = total ? Math.min(1, sent / total) : 0;
  const pct = Math.floor(frac * 100);
  const current = files.find((f) => f.state === "sending") ?? files.find((f) => f.state === "waiting") ?? files[files.length - 1];
  const many = files.length > 1;
  const doneCount = files.filter((f) => f.state === "sent").length;

  return (
    <section aria-label="Upload progress" className={`motion-safe:starting:translate-y-1 flex flex-col items-center gap-3 text-center transition-[opacity,translate] duration-200 ease-[var(--ease-out)] starting:opacity-0 ${className}`}>
      <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-bone">Sending to {receiverName}</h2>
      <FileRow
        title={current?.name ?? ""}
        meta={`${many ? `Track ${Math.min(doneCount + 1, files.length)} of ${files.length} · ` : ""}Sending · ${timeLeft(sent, total, startedAt)}`}
        right={<span className="shrink-0 text-[15px] font-bold text-bone tnum">{pct}%</span>}
      >
        <div role="progressbar" aria-label="Upload progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-well">
          <div className="h-full w-full origin-left rounded-full bg-lime transition-transform duration-200 ease-linear motion-reduce:transition-none" style={{ transform: `scaleX(${Math.max(0.02, frac)})` }} />
        </div>
      </FileRow>

      {many && (
        <ol className="w-full divide-y divide-line border-y border-line text-left text-[13px]">
          {files.map((f, i) => (
            <li key={`${i}-${f.name}`} className="flex items-center justify-between gap-3 py-2.5">
              <span className={`truncate ${f.state === "sent" ? "text-mute" : "text-bone"}`}>{f.name}</span>
              <span className={`shrink-0 text-[12px] ${f.state === "sent" ? "text-bone" : f.state === "failed" ? "text-danger" : "text-dim"}`}>
                {f.state === "sent" ? "Sent" : f.state === "sending" ? `${Math.floor(f.progress * 100)}%` : f.state === "failed" ? "Not sent" : "Waiting"}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="text-[13px] text-mute">
        {retry
          ? `The signal dropped. Trying again by itself (${retry.attempt} of ${retry.of}), from the start of this file.`
          : checking
            ? "Uploaded. Checking your file for viruses: this can take up to a minute. Keep this page open."
            : "Keep this page open until it says sent."}
      </p>
      <button type="button" onClick={onCancel} className="btn-ghost min-h-11 rounded-xl px-4 text-[13px]">
        Cancel
      </button>
    </section>
  );
}
