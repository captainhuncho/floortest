"use client";

import Link from "next/link";
import { Fragment } from "react";
import { PlayIcon, usePlayer } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { ago, fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import { useQueue } from "./review/QueueState";

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
  /** Set prep, on kept tracks. */
  energy?: number | null;
  cueCount?: number;
  /** The folder this track came in, if any; its tracks are listed together under a header. */
  release?: { id: string; title: string; count: number } | null;
};


/** `showDecision`: the Kept / Not for me / Needs review chip, only where the tab doesn't already say it (All). */
export function TrackList({ rows, selectedId, hrefFor, showDecision = true }: { rows: Row[]; selectedId: number | null; hrefFor: Record<number, string>; showDecision?: boolean }) {
  const { current, playing, time, duration, play, seek } = usePlayer();
  // In the Review Queue (QueueState) a tap shows the track at once and a decided track leaves straight away.
  const state = useQueue();
  const shownRows = state ? rows.filter((r) => !state.gone.has(r.id)) : rows;
  const openId = state?.shown?.id ?? selectedId;
  const queue = shownRows.map(toPlayer);
  const pick = (e: React.MouseEvent, r: Row) => {
    if (!state || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    state.show({ ...toPlayer(r), genre: r.genre, bpm: r.bpm });
    // Below 1280px the open track is a card above the list: bring it into view.
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("review-card")?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
  };

  return (
    <ul className="@container panel divide-y divide-line overflow-hidden" aria-label="Tracks">
      {shownRows.map((r, i) => {
        const header = r.release && r.release.id !== shownRows[i - 1]?.release?.id;
        const isCurrent = current?.id === r.id;
        const selected = openId === r.id;
        const d = duration || r.duration || 0;
        return (
          <Fragment key={r.id}>
          {header && (
            <li className="flex items-baseline gap-2 bg-ink-2 px-4 py-2 text-sm">
              <span className="text-xs font-semibold text-mute">Folder</span>
              <span className="min-w-0 truncate font-semibold">{r.release!.title}</span>
              <span className="shrink-0 font-mono text-xs text-mute tnum">· {r.release!.count} tracks</span>
            </li>
          )}
          {/* Rule 15 Queue (28 Oct): one flat panel, a hairline between rows; the open track has a 2px bone edge, lime stays for Keep.
              The whole row opens the track (the play button sits above that); below 1280px the open track is the card
              above the list, so its row steps aside and the list reads as what's next. */}
          <li
            aria-current={selected ? "true" : undefined}
            className={`group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-l-2 px-3 py-2.5 transition-colors active:bg-ink-3 sm:px-4 @3xl:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)_auto] ${
              selected ? `border-l-bone bg-ink-4 ${state ? "max-xl:hidden" : ""}` : "border-l-transparent hover:bg-ink-2"
            } ${r.release ? "pl-6 sm:pl-6" : ""}`}
          >
            <button
              onClick={() => play(toPlayer(r), queue)}
              className={`relative z-10 grid size-11 place-items-center rounded-lg border transition ${
                isCurrent ? "border-bone text-bone" : "border-line text-bone group-hover:border-mute"
              }`}
              aria-label={isCurrent && playing ? `Pause ${r.title}` : `Play ${r.title}`}
            >
              <PlayIcon playing={isCurrent && playing} className="size-3.5" />
            </button>
            <Link href={hrefFor[r.id]} scroll={false} onClick={(e) => pick(e, r)} className="flex min-w-0 flex-col gap-0.5 rounded-sm after:absolute after:inset-0">
              <span className="truncate text-[15px] font-semibold text-bone">{r.title}</span>
              <span className="truncate text-[13px] text-mute">
                {r.sender !== r.artist ? `${r.artist} · via ${r.sender}` : r.artist}
                {r.genre ? ` · ${r.genre}` : ""}
                {r.collection ? ` · ${r.collection}` : ""}
              </span>
            </Link>
            <div className={`hidden min-w-0 @3xl:block ${isCurrent ? "relative z-10" : ""}`}>
              <Waveform peaks={r.peaks} height={28} progress={isCurrent && d ? time / d : 0} duration={d} onSeek={isCurrent ? seek : undefined} dim={!!r.decision && !isCurrent} />
            </div>
            <div className="flex items-center gap-3 text-xs text-mute">
              <span className="hidden @xl:inline">{statusWords(r, showDecision)}</span>
              <span className="hidden w-16 text-right font-mono tnum @3xl:block">{r.bpm ? `${Math.round(r.bpm)} BPM` : ""}</span>
              <span className="w-10 text-right font-mono text-faint tnum">{fmtTime(r.duration)}</span>
              <span className="hidden w-16 text-right @4xl:block" suppressHydrationWarning>
                {ago(r.createdAt)}
              </span>
            </div>
          </li>
          </Fragment>
        );
      })}
    </ul>
  );
}

/** The Queue's status in plain words (no chips): the decision where the tab doesn't already say it, then what the sender sees. */
function statusWords(row: Pick<Row, "decision" | "played" | "downloaded">, decision: boolean) {
  const call = !decision ? null : row.decision === "kept" ? "Kept" : row.decision === "passed" ? "Not for me" : "Needs review";
  const seen = row.downloaded ? "Downloaded" : row.played ? "Listened" : decision ? null : "New";
  return [call, seen].filter(Boolean).join(" · ");
}

/** Status is always spelled out, never colour alone. */
export function Status({ row, decision = true }: { row: Pick<Row, "decision" | "played" | "downloaded">; decision?: boolean }) {
  return (
    <>
      {!decision ? null : row.decision === "kept" ? (
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
