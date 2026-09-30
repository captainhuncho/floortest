"use client";

import Link from "next/link";
import { PlayIcon, usePlayer } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import type { Row } from "../TrackList";

const ago = (ts: number) => {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** Figma "track-card": kept tracks on Prepare for set, playable in place. */
export function KeptCards({ rows }: { rows: Row[] }) {
  const { current, playing, time, duration, play, seek } = usePlayer();
  const queue = rows.map(toPlayer);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const on = current?.id === r.id;
        const d = (on && duration) || r.duration || 0;
        return (
          <li key={r.id} className="flex flex-col gap-3 rounded-xl border border-line bg-ink-3 p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => play(toPlayer(r), queue)}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-ink"
                aria-label={on && playing ? `Pause ${r.title}` : `Play ${r.title}`}
              >
                {on && playing ? (
                  <PlayIcon playing className="size-3" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/icons/play.svg" alt="" className="size-3" />
                )}
              </button>
              <Link href={`/dashboard?view=queue&s=all&t=${r.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-bold text-bone">{r.title}</span>
                <span className="truncate text-[11px] text-mute">
                  {[r.artist, r.genre, r.sender !== r.artist ? `via ${r.sender}` : null].filter(Boolean).join(" · ")}
                </span>
              </Link>
              <span className="shrink-0 text-[10px] text-faint">{ago(r.createdAt)}</span>
            </div>
            <Waveform peaks={r.peaks} progress={on && d ? time / d : 0} onSeek={on ? seek : undefined} height={24} label={`Seek ${r.title}`} />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="rounded border border-white bg-white/[0.12] px-1.5 py-0.5 text-[9px] font-bold text-white">Kept</span>
                <span className="text-[11px] text-mute">{r.downloaded ? "Downloaded" : r.played ? "Listened" : "Not played yet"}</span>
              </span>
              <span className="flex items-center gap-2 text-[11px]">
                {r.bpm ? <span className="font-medium text-mute">{Math.round(r.bpm)} BPM</span> : null}
                <span className="text-faint tnum">{fmtTime(r.duration)}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
