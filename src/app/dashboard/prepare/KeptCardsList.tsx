"use client";

import { useState, useTransition } from "react";
import { usePlayer } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { TrackRow, trackAge } from "@/components/TrackRow";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import type { PlayedOutStatus } from "@/lib/played-out-prompt";
import { playedOutBatch } from "../actions/review";
import type { Row } from "../TrackList";

/**
 * Kept tracks on Prepare, playable in place: the shared TrackRow (this list is the one it was built from), as plain rows
 * with hairlines between them inside the Kept tracks card. The readouts (BPM, length, prep, signal, age) sit on a line
 * under the title, as in the mock, so the title keeps its width beside the waveform. The tag reads Kept, or Played out
 * once marked; `canMark` (DJ desks, owner and A&R / Admin) offers "Played it out" under tracks the sender didn't mark
 * evaluation-only.
 */
export function KeptCardsList({ rows, status, canMark }: { rows: Row[]; status: Record<number, PlayedOutStatus>; canMark: boolean }) {
  const { current, playing, time, duration, play, seek } = usePlayer();
  const queue = rows.map(toPlayer);
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const on = current?.id === r.id;
        const d = (on && duration) || r.duration || 0;
        return (
          <KeptRow
            key={r.id}
            row={r}
            status={status[r.id]}
            canMark={canMark}
            playing={on && playing}
            onPlay={() => play(toPlayer(r), queue)}
            waveform={<Waveform peaks={r.peaks} progress={on && d ? time / d : 0} duration={d} onSeek={on ? seek : undefined} height={28} label={`Seek ${r.title}`} />}
          />
        );
      })}
    </ul>
  );
}

function KeptRow({
  row: r,
  status,
  canMark,
  playing,
  onPlay,
  waveform,
}: {
  row: Row;
  status: PlayedOutStatus | undefined;
  canMark: boolean;
  playing: boolean;
  onPlay: () => void;
  waveform: React.ReactNode;
}) {
  // Marked here a moment ago shows straight away; a failed save takes it back.
  const [at, setAt] = useState(status?.at ?? null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const prep = [r.energy ? `E${r.energy}` : null, r.cueCount ? `${r.cueCount} cue${r.cueCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
  const signal = r.downloaded ? "Downloaded" : r.played ? "Listened" : "Not played";

  const fail = () => {
    setAt(null);
    toast.show({ message: "Couldn't save that. Nothing changed. Try again." });
  };
  const mark = () => {
    setAt(Date.now());
    start(async () => {
      try {
        if (await playedOutBatch([r.id], "", "prepare")) toast.show({ message: `${r.sender} will hear their track was played out` });
        else fail();
      } catch {
        fail();
      }
    });
  };

  // Under the row: the where-note once played out, the reminder on evaluation-only tracks, or the action.
  // pl-11 lines it up with the title, past the 32px play dot and its gap.
  let under: React.ReactNode = null;
  if (status && at && status.note) under = <p className="truncate pl-11 text-[11px] text-faint">{status.note}</p>;
  else if (status && !at && canMark)
    under = status.setsOk ? (
      <div className="flex pl-11">
        <button className="btn-ghost btn-sm tap rounded-[11px] bg-well" disabled={pending} onClick={mark}>
          Played it out
        </button>
      </div>
    ) : (
      <p className="pl-11 text-[11px] text-faint">Evaluation only: ask before playing it out</p>
    );

  return (
    <TrackRow
      title={r.title}
      sub={[r.artist, r.genre, r.sender !== r.artist ? `via ${r.sender}` : null].filter(Boolean).join(" · ")}
      href={`/dashboard/review?view=queue&s=all&t=${r.id}`}
      onPlay={onPlay}
      playing={playing}
      waveform={waveform}
      status={status && at ? "Played out" : "Kept"}
      surface="row"
      className="px-0! py-3!"
    >
      {/* The readouts: the numbers bone, the context faint. A signal, not a control: plain text. */}
      <p className="flex flex-wrap gap-x-2.5 gap-y-1 pl-11 font-mono text-[11px] text-faint tnum">
        {r.bpm ? (
          <span>
            <b className="font-semibold text-bone">{Math.round(r.bpm)}</b> BPM
          </span>
        ) : null}
        {r.duration ? (
          <span>
            <span className="sr-only">Length </span>
            {fmtTime(r.duration)}
          </span>
        ) : null}
        {prep && <b className="font-semibold text-bone">{prep}</b>}
        <span>{signal}</span>
        <span title={new Date(r.createdAt).toLocaleString()} suppressHydrationWarning>
          {/* Worked out against the clock, which moves between server and browser. */}
          <span className="sr-only">Arrived </span>
          {trackAge(r.createdAt)} ago
        </span>
      </p>
      {under}
    </TrackRow>
  );
}
