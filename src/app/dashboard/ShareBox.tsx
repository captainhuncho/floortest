"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { shareTrack, stopSharing } from "./actions";

/** Share a track with a colleague: a private listen-only link that expires after a week. */
export function ShareBox({
  trackId,
  active,
  canDownload,
  audience,
}: {
  trackId: number;
  active: { url: string; expires: string; plays: number } | null;
  /** Fixed when the track was sent: the receiver was on a paid plan then. */
  canDownload: boolean;
  audience: { name: string; handle: string; plays: number; downloads: number }[];
}) {
  const [link, setLink] = useState(active);
  const [pending, start] = useTransition();
  const toast = useToast();
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ message: "Share link copied" });
    } catch {
      toast.show({ message: url });
    }
  };
  return (
    <section className="rounded-xl border border-line bg-ink-2 p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[1px] text-mute">Share with a colleague</h3>
      {link ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="truncate text-[12px] text-bone">{link.url.replace(/^https?:\/\//, "")}</p>
          <p className="text-[11px] text-faint">
            {canDownload ? "Listen and download" : "Listen-only, no download button"} · works until {link.expires} · {link.plays} play{link.plays === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => copy(link.url)} className="rounded-md bg-bone px-3 py-1.5 text-[11px] font-bold text-ink">
              Copy link
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await stopSharing(trackId);
                  setLink(null);
                  toast.show({ message: "Share link switched off" });
                })
              }
              className="rounded-md border border-line px-3 py-1.5 text-[11px] font-bold text-mute hover:text-bone"
            >
              Switch off
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-mute">
            A private link for a colleague with a FloorTest account to {canDownload ? "listen to and download" : "listen to"} for 7 days, for promotion and their sets. The sender is told.
            {!canDownload && (
              <>
                {" "}
                Colleagues can download tracks sent (or approved by the artist) while you&apos;re on{" "}
                <a href="/dashboard/plans" className="text-bone underline underline-offset-4">
                  Pro
                </a>
                .
              </>
            )}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await shareTrack(trackId);
                if (!r) return toast.show({ message: "This track can't be shared." });
                const expires = new Date(r.expires).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                setLink({ url: r.url, expires, plays: 0 });
                copy(r.url);
              })
            }
            className="rounded-md bg-lime px-3 py-1.5 text-[11px] font-bold text-ink active:scale-95"
          >
            {pending ? "Creating…" : "Create share link"}
          </button>
        </div>
      )}
      {audience.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-faint">Who listened</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[11px]">
            {audience.map((a) => (
              <li key={a.handle} className="flex justify-between gap-3">
                <span className="truncate">
                  {a.name} <span className="text-faint">/{a.handle}</span>
                </span>
                <span className="shrink-0 text-mute">
                  {a.plays} play{a.plays === 1 ? "" : "s"}
                  {a.downloads ? ` · downloaded` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
