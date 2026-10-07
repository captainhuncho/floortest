"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fmtBytes } from "@/lib/format";

const SEGMENTS = 20;

export type TransferFile = { name: string; size: number; progress: number; state: "waiting" | "sending" | "sent" | "failed" };

/** "About 12 seconds remaining", from the real upload speed so far. */
function timeLeft(sent: number, total: number, startedAt: number) {
  const secs = (Date.now() - startedAt) / 1000;
  if (sent <= 0 || secs < 2) return "Working out the time left…";
  const left = ((total - sent) / (sent / secs));
  if (left < 5) return "Almost done";
  if (left < 60) return `About ${Math.round(left / 5) * 5} seconds remaining`;
  const mins = Math.round(left / 60);
  return `About ${mins} minute${mins === 1 ? "" : "s"} remaining`;
}

/**
 * Figma "Floortest / Transfer status" (desk 317:2759, mobile 322:823): shown full screen while tracks upload, in place
 * of the form. The file in flight, a 20-step progress bar over all files, time left, and the delivery step that follows.
 */
export function TransferScreen({ receiverName, handle, callout, files, startedAt, onCancel }: {
  receiverName: string;
  handle: string;
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
  const lit = Math.round((pct / 100) * SEGMENTS);
  const current = files.find((f) => f.state === "sending") ?? files.find((f) => f.state === "waiting") ?? files[files.length - 1];
  const index = files.indexOf(current) + 1;
  const many = files.length > 1;
  const ext = current?.name.split(".").pop()?.toUpperCase() ?? "";
  const meta = "text-[12px] font-medium tracking-[0.5px]";
  const label = `${meta} uppercase`;

  // Attached to <body> so it covers the whole page, whatever the form sits inside.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="region" aria-label="Transfer status" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink px-5 py-6 text-bone sm:px-12 sm:pb-8 sm:pt-9">
      <header className="flex items-center justify-between gap-4">
        <p className="text-[22px] font-extrabold">floortest</p>
        <p className={`${label} text-dim`}>Public submission</p>
      </header>

      <main className="flex flex-1 flex-col items-center py-8 sm:py-16">
        <div className="w-full max-w-[1100px] space-y-8 sm:space-y-6">
          <div className="space-y-4">
            <p className={`${label} text-dim`}>Transfer status</p>
            <h1 className="text-[28px] font-semibold leading-[34px] tracking-[-0.5px] sm:text-[40px] sm:leading-[44px] sm:tracking-[-1.2px]">
              Transferring your {many ? `${files.length} tracks` : "track"} to {receiverName}
            </h1>
            <p className={`flex flex-wrap items-center gap-3 ${label}`}>
              <span className="text-mute">You</span>
              <span aria-hidden className="text-base text-dim">
                →
              </span>
              <span className="sr-only">to</span>
              <span>{receiverName}</span>
              <span className="text-dim">
                {callout ? `${callout} · ` : ""}@{handle}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
            <section aria-labelledby="xfer-h" className="flex flex-col gap-6 rounded-lg border border-line-2 bg-ink-2 p-4 sm:p-6 lg:w-[728px] lg:shrink-0">
              <div className="flex items-center justify-between gap-3">
                <h2 id="xfer-h" className="text-[20px] font-semibold leading-[26px] tracking-[-0.2px]">
                  File transfer
                </h2>
                <span className="rounded-full border border-[#536400] bg-ink-3 px-3 py-[7px] text-[12px] font-medium uppercase text-lime sm:text-[10px]">In progress</span>
              </div>

              {current && (
                <div className="flex min-h-[84px] items-center gap-3 rounded-lg border border-line bg-ink-2 p-4 sm:gap-[18px] sm:p-[18px]">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-base font-semibold sm:text-lg">{current.name}</p>
                    <p className="text-[12px] text-dim">{many ? `Track ${index} of ${files.length}` : "Original audio file"}</p>
                  </div>
                  <div className="shrink-0 space-y-[5px] text-[12px] font-medium sm:text-[11px]">
                    <p>{fmtBytes(current.size)}</p>
                    <p className="text-dim sm:text-[10px]">{ext}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`${label} text-mute`}>
                    {fmtBytes(sent)} / {fmtBytes(total)} transferred
                  </p>
                  <p className="text-[28px] font-semibold leading-[34px] tracking-[-0.5px] tnum">{pct}%</p>
                </div>
                <div role="progressbar" aria-label="Transfer progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="flex h-4 gap-1">
                  {Array.from({ length: SEGMENTS }, (_, i) => (
                    <span key={i} className={`h-4 min-w-px flex-1 rounded-[2px] transition-colors ${i < lit ? "bg-lime" : "bg-line-2"}`} />
                  ))}
                </div>
                <p className={`${meta} text-dim`}>{timeLeft(sent, total, startedAt)}</p>
              </div>
            </section>

            <section aria-labelledby="deliver-h" className="flex flex-1 flex-col gap-4 rounded-lg border border-line p-5 sm:p-6 lg:gap-5">
              <p className={`${label} text-dim`}>Next stage</p>
              <h2 id="deliver-h" className="text-[20px] font-semibold leading-[26px] tracking-[-0.2px]">
                Delivery confirmation
              </h2>
              <span className="w-fit rounded-full border border-line bg-ink-3 px-3 py-[7px] text-[12px] font-medium uppercase text-mute sm:text-[10px]">Waiting</span>
              <p className="text-sm text-mute">Waiting for the file transfer to finish. Confirmation will appear here afterward.</p>
              <dl className={`pt-1 ${meta}`}>
                <div className="flex justify-between gap-4 border-b border-line py-3">
                  <dt className="uppercase text-dim">Recipient</dt>
                  <dd className="truncate">{receiverName}</dd>
                </div>
                {callout && (
                  <div className="flex justify-between gap-4 border-b border-line py-3">
                    <dt className="uppercase text-dim">Callout</dt>
                    <dd className="truncate">{callout}</dd>
                  </div>
                )}
              </dl>
            </section>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base text-mute">Keep this tab open until the transfer finishes.</p>
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 w-full rounded-full border border-line bg-ink-2 px-[22px] py-[14px] text-sm font-semibold text-mute hover:text-bone sm:w-auto sm:text-[13px]"
            >
              Cancel transfer
            </button>
          </div>
        </div>
      </main>

      <footer className={`flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:pt-0 ${meta} text-dim`}>
        <p>Original tracks. Straight to the floor.</p>
        <a href={`/contact?report=${encodeURIComponent(handle)}`} className="inline-flex min-h-11 items-center hover:text-bone sm:min-h-0">
          Report impersonation
        </a>
      </footer>
    </div>,
    document.body,
  );
}
