"use client";

import Link from "next/link";
import { PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { ago, fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";

export type Row = {
  id: number;
  title: string;
  artist: string;
  sender: string;
  collection: string | null;
  genre: string;
  duration: number | null;
  bpm: number | null;
  peaks: number[] | null;
  played: boolean;
  downloaded: boolean;
  decision: "kept" | "passed" | null;
  hasMessage: boolean;
  createdAt: number;
};


export function TrackList({ rows, selectedId, hrefFor }: { rows: Row[]; selectedId: number | null; hrefFor: Record<number, string> }) {
  const { current, playing, time, duration, play, seek } = usePlayer();
  const queue = rows.map(toPlayer);

  return (
    <ul className="@container divide-y divide-line rounded-xl border border-line" aria-label="Tracks">
      {rows.map((r) => {
        const isCurrent = current?.id === r.id;
        const selected = selectedId === r.id;
        const d = duration || r.duration || 0;
        return (
          <li
            key={r.id}
            aria-current={selected ? "true" : undefined}
            className={`group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-3 py-3 transition @3xl:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)_auto] ${
              selected ? "bg-ink-3" : "hover:bg-ink-2"
            }`}
          >
            {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r bg-lime" />}
            <button
              onClick={() => play(toPlayer(r), queue)}
              className={`grid h-10 w-10 place-items-center rounded-full border transition ${
                isCurrent ? "border-lime bg-lime text-ink" : "border-line text-bone group-hover:border-mute"
              }`}
              aria-label={isCurrent && playing ? `Pause ${r.title}` : `Play ${r.title}`}
            >
              <PlayIcon playing={isCurrent && playing} className="h-3.5 w-3.5" />
            </button>
            <Link href={hrefFor[r.id]} scroll={false} className="min-w-0 rounded-sm">
              <p className="truncate text-[15px] font-medium">{r.title}</p>
              <p className="truncate text-sm text-mute">
                {r.artist}
                {r.genre ? ` · ${r.genre}` : ""}
                {r.sender !== r.artist ? ` · via ${r.sender}` : ""}
                {r.collection ? ` · ${r.collection}` : ""}
              </p>
            </Link>
            <div className="hidden min-w-0 @3xl:block">
              <Waveform peaks={r.peaks} height={28} progress={isCurrent && d ? time / d : 0} onSeek={isCurrent ? seek : undefined} dim={!!r.decision && !isCurrent} />
            </div>
            <div className="flex items-center gap-3 text-sm text-mute tnum">
              <span className="hidden gap-1 @xl:flex">
                <Status row={r} />
              </span>
              <span className="hidden w-16 text-right @3xl:block">{r.bpm ? `${Math.round(r.bpm)} BPM` : ""}</span>
              <span className="w-10 text-right">{fmtTime(r.duration)}</span>
              <span className="hidden w-16 text-right @4xl:block" suppressHydrationWarning>
                {ago(r.createdAt)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Status is always spelled out, never colour alone. */
export function Status({ row }: { row: Pick<Row, "decision" | "played" | "downloaded"> }) {
  return (
    <>
      {row.decision === "kept" ? (
        <span className="chip border-lime/60 text-lime">Kept</span>
      ) : row.decision === "passed" ? (
        <span className="chip border-line text-mute">Not for me</span>
      ) : (
        <span className="chip border-bone/30 text-bone">Needs review</span>
      )}
      {row.downloaded ? (
        <span className="chip border-line text-mute">Downloaded</span>
      ) : row.played ? (
        <span className="chip border-line text-mute">Listened</span>
      ) : null}
    </>
  );
}
