"use client";

import { Fragment } from "react";
import { usePlayer } from "@/components/Player";
import { trackColumns, TrackRow } from "@/components/TrackRow";
import { Waveform } from "@/components/Waveform";
import { decisionLabel } from "@/lib/statuses";
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
  /** Set prep, on kept tracks. */
  energy?: number | null;
  cueCount?: number;
  /** The folder this track came in, if any; its tracks are listed together under a header. */
  release?: { id: string; title: string; count: number } | null;
};

/**
 * The Queue's list beside the review column, as shared TrackRows: each title opens that track in the panel. Sized to
 * its own width (it shares the screen with the panel from 1280px up). `showDecision`: the Kept / Not for me / Needs
 * review tag, only where the tab doesn't already say it (All).
 */
export function TrackList({ rows, selectedId, hrefFor, showDecision = true }: { rows: Row[]; selectedId: number | null; hrefFor: Record<number, string>; showDecision?: boolean }) {
  const { current, playing, time, duration, play, seek } = usePlayer();
  const queue = rows.map(toPlayer);

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line" aria-label="Tracks">
      {rows.map((r, i) => {
        const header = r.release && r.release.id !== rows[i - 1]?.release?.id;
        const isCurrent = current?.id === r.id;
        const d = duration || r.duration || 0;
        const signal = r.downloaded ? "Downloaded" : r.played ? "Listened" : "";
        return (
          <Fragment key={r.id}>
            {header && (
              <li className="flex items-baseline gap-2 bg-ink-2 px-3 py-2 text-sm">
                <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-mute">Folder</span>
                <span className="min-w-0 truncate font-semibold">{r.release!.title}</span>
                <span className="shrink-0 text-mute tnum">· {r.release!.count} tracks</span>
              </li>
            )}
            <TrackRow
              surface="row"
              fit="container"
              title={r.title}
              sub={[r.artist, r.genre, r.sender !== r.artist ? `via ${r.sender}` : null, r.collection].filter(Boolean).join(" · ")}
              href={hrefFor[r.id]}
              scroll={false}
              selected={selectedId === r.id}
              onPlay={() => play(toPlayer(r), queue)}
              playing={isCurrent && playing}
              waveform={<Waveform peaks={r.peaks} height={28} progress={isCurrent && d ? time / d : 0} duration={d} onSeek={isCurrent ? seek : undefined} dim={!!r.decision && !isCurrent} />}
              status={showDecision ? decisionLabel(r.decision) : null}
              columns={[
                // A signal, not a control: plain text, only where there's room.
                { key: "signal", value: signal, width: "w-20", from: "md" },
                ...trackColumns(r, { bpm: "lg", age: "sm" }),
              ]}
              className={`${r.release ? "pl-6" : ""} ${selectedId === r.id ? "" : "hover:bg-ink-2"}`}
            />
          </Fragment>
        );
      })}
    </ul>
  );
}

/** Status is always spelled out, never colour alone. */
export function Status({ row, decision = true }: { row: Pick<Row, "decision" | "played" | "downloaded">; decision?: boolean }) {
  return (
    <>
      {!decision ? null : row.decision === "kept" ? (
        <span className="chip border-line text-mute">Kept</span>
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
