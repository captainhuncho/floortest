"use client";

import Link from "next/link";
import { Fragment } from "react";
import { PlayIcon, usePlayer } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { ago, fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import { useQueue } from "./review/QueueState";
import { Chip } from "@/components/Kit";

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
    <ul className="@container flex flex-col" aria-label="Tracks">
      {shownRows.map((r, i) => {
        const header = r.release && r.release.id !== shownRows[i - 1]?.release?.id;
        const isCurrent = current?.id === r.id;
        const selected = openId === r.id;
        const d = duration || r.duration || 0;
        const words = statusWords(r, showDecision);
        return (
          <Fragment key={r.id}>
          {header && (
            <li className="mt-1 flex items-baseline gap-2 rounded-[10px] bg-well px-2.5 py-1.5 text-[12px]">
              <span className="text-[11px] font-semibold text-mute">Folder</span>
              <span className="min-w-0 truncate font-semibold text-bone">{r.release!.title}</span>
              <span className="shrink-0 text-[11px] text-mute tnum">· {r.release!.count} tracks</span>
            </li>
          )}
          {/* Redesign (30 Oct): list rows with a hairline between them; the open track sits on a raised fill with a lime
              edge. The whole row opens the track (the play button sits above that); below 1280px the open track is the
              card above the list, so its row steps aside and the list reads as what's next. */}
          <li
            aria-current={selected ? "true" : undefined}
            className={`group relative grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-t py-2 transition-colors first:border-t-transparent @3xl:grid-cols-[auto_minmax(0,14rem)_minmax(0,1fr)_auto] ${
              selected
                ? `rounded-xl border-t-transparent bg-well px-2 shadow-[inset_2px_0_0_var(--color-lime)] ${state ? "max-xl:hidden" : ""}`
                : "border-line px-0.5 hover:bg-well/60"
            } ${selected ? "" : "[[aria-current]+&]:border-t-transparent"} ${r.release ? "pl-4" : ""}`}
          >
            <button
              onClick={() => play(toPlayer(r), queue)}
              className={`relative z-10 grid size-11 place-items-center rounded-[11px] border transition-colors ${
                isCurrent ? "border-lime/50 bg-lime/12 text-lime" : "border-line bg-well text-bone group-hover:border-line-2"
              }`}
              aria-label={isCurrent && playing ? `Pause ${r.title}` : `Play ${r.title}`}
            >
              <PlayIcon playing={isCurrent && playing} className="size-3.5" />
            </button>
            <Link href={hrefFor[r.id]} scroll={false} onClick={(e) => pick(e, r)} className="flex min-w-0 flex-col gap-0.5 rounded-sm after:absolute after:inset-0">
              <span className="truncate text-[13px] font-semibold text-bone">{r.title}</span>
              <span className="truncate text-[11.5px] text-mute">
                {r.sender !== r.artist ? `${r.artist} · via ${r.sender}` : r.artist}
                {r.genre ? ` · ${r.genre}` : ""}
                {r.collection ? ` · ${r.collection}` : ""}
              </span>
            </Link>
            <div className={`hidden min-w-0 @3xl:block ${isCurrent ? "relative z-10" : ""}`}>
              <Waveform peaks={r.peaks} height={28} progress={isCurrent && d ? time / d : 0} duration={d} onSeek={isCurrent ? seek : undefined} dim={!!r.decision && !isCurrent} />
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-mute">
              {words && <span className="hidden @xl:inline">{words}</span>}
              <span className="hidden w-16 text-right tnum @3xl:block">{r.bpm ? `${Math.round(r.bpm)} BPM` : ""}</span>
              <span className="hidden w-10 text-right text-faint tnum @sm:block">{fmtTime(r.duration)}</span>
              {/* How long it has waited: lime until it's been played or decided, flat after. */}
              <Chip tone={!r.played && !r.decision ? "acc" : "flat"}>
                <span suppressHydrationWarning>{ago(r.createdAt).replace(/ ago$/, "")}</span>
              </Chip>
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
