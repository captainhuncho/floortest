"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PlayIcon, usePlayer } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import type { PlayedOutStatus } from "@/lib/played-out-prompt";
import { playedOutBatch } from "../actions/review";
import type { Row } from "../TrackList";

const ago = (ts: number) => {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/**
 * Figma "track-card": kept tracks on Prepare for set, playable in place. Each shows Played out once marked; `canMark`
 * (DJ desks, owner and A&R / Admin) offers "Played it out" on tracks the sender didn't mark evaluation-only.
 */
export function KeptCardsList({ rows, status, canMark }: { rows: Row[]; status: Record<number, PlayedOutStatus>; canMark: boolean }) {
  const { current, playing, time, duration, play, seek } = usePlayer();
  const queue = rows.map(toPlayer);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const on = current?.id === r.id;
        const d = (on && duration) || r.duration || 0;
        return (
          <li key={r.id} className="flex flex-col gap-3 card p-4 md:px-4 md:py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => play(toPlayer(r), queue)}
                className="play-dot grid size-8 shrink-0 place-items-center rounded-full"
                aria-label={on && playing ? `Pause ${r.title}` : `Play ${r.title}`}
              >
                {on && playing ? (
                  <PlayIcon playing className="size-3" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/icons/play.svg" alt="" className="size-3" />
                )}
              </button>
              <Link href={`/dashboard/review?view=queue&s=all&t=${r.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 md:min-w-[10rem]">
                <span className="truncate text-[13px] font-bold text-bone">{r.title}</span>
                <span className="truncate text-[11px] text-mute">
                  {[r.artist, r.genre, r.sender !== r.artist ? `via ${r.sender}` : null].filter(Boolean).join(" · ")}
                </span>
              </Link>
              {/* Desktop: one row, as Figma "desktop-prepare-for-set" */}
              <div className="hidden shrink-0 md:block md:w-36 lg:w-48 xl:w-64">
                <Waveform peaks={r.peaks} progress={on && d ? time / d : 0} duration={d} onSeek={on ? seek : undefined} height={28} label={`Seek ${r.title}`} />
              </div>
              <span className="hidden shrink-0 items-center gap-3 md:flex">
                <span className="rounded border border-bone bg-bone/[0.12] px-1.5 py-0.5 text-[11px] font-bold text-bone">Kept</span>
                {(r.energy || r.cueCount) ? (
                  <span className="text-[11px] font-bold text-bone">
                    {[r.energy ? `E${r.energy}` : null, r.cueCount ? `${r.cueCount} cue${r.cueCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
                <span className="w-20 text-[11px] text-mute">{r.downloaded ? "Downloaded" : r.played ? "Listened" : "Not played"}</span>
                <span className="w-14 text-right text-[11px] font-medium text-mute">{r.bpm ? `${Math.round(r.bpm)} BPM` : ""}</span>
                <span className="w-10 text-right text-[11px] text-faint tnum">{fmtTime(r.duration)}</span>
              </span>
              <span className="shrink-0 text-[11px] text-faint md:w-14 md:text-right">{ago(r.createdAt)}</span>
            </div>
            <div className="md:hidden">
              <Waveform peaks={r.peaks} progress={on && d ? time / d : 0} duration={d} onSeek={on ? seek : undefined} height={24} label={`Seek ${r.title}`} />
            </div>
            <div className="flex items-center justify-between md:hidden">
              <span className="flex items-center gap-2">
                <span className="rounded border border-bone bg-bone/[0.12] px-1.5 py-0.5 text-[11px] font-bold text-bone">Kept</span>
                {(r.energy || r.cueCount) ? (
                  <span className="text-[11px] font-bold text-bone">
                    {[r.energy ? `E${r.energy}` : null, r.cueCount ? `${r.cueCount} cue${r.cueCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
                <span className="text-[11px] text-mute">{r.downloaded ? "Downloaded" : r.played ? "Listened" : "Not played yet"}</span>
              </span>
              <span className="flex items-center gap-2 text-[11px]">
                {r.bpm ? <span className="font-medium text-mute">{Math.round(r.bpm)} BPM</span> : null}
                <span className="text-faint tnum">{fmtTime(r.duration)}</span>
              </span>
            </div>
            <PlayedOutLine row={r} status={status[r.id]} canMark={canMark} />
          </li>
        );
      })}
    </ul>
  );
}

/** The card's Played out line: the status once marked, otherwise the action (or the evaluation-only reminder). */
function PlayedOutLine({ row, status, canMark }: { row: Row; status: PlayedOutStatus | undefined; canMark: boolean }) {
  const [at, setAt] = useState(status?.at ?? null);
  const [pending, start] = useTransition();
  const toast = useToast();
  if (!status) return null;
  if (at)
    return (
      <p className="flex min-w-0 items-center gap-2 text-[11px]">
        <span className="chip border-lime/60 text-lime">Played out</span>
        {status.note && <span className="truncate text-mute">{status.note}</span>}
      </p>
    );
  if (!canMark) return null;
  if (!status.setsOk) return <p className="text-[11px] text-faint">Evaluation only: ask before playing it out</p>;
  const fail = () => {
    setAt(null);
    toast.show({ message: "Couldn't save that. Nothing changed. Try again." });
  };
  return (
    <div className="flex">
      <button
        className="btn-ghost btn-sm tap"
        disabled={pending}
        onClick={() => {
          setAt(Date.now());
          start(async () => {
            try {
              if (await playedOutBatch([row.id], "", "prepare")) toast.show({ message: `${row.sender} will hear their track was played out` });
              else fail();
            } catch {
              fail();
            }
          });
        }}
      >
        Played it out
      </button>
    </div>
  );
}
