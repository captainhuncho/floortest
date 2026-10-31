"use client";

import { PlayIcon, usePlayer } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";

type Hero = { id: number; title: string; artist: string; peaks: number[] | null; duration: number | null; played: boolean };

/** How many bars the waveform draws: rounded bars like the mock, kept short (owner, 30 Oct: small, not much space). */
const BARS = 56;

/** The track's peaks folded into BARS values (the loudest in each slice), so any length draws the same width. */
function bars(peaks: number[] | null) {
  if (!peaks?.length) return Array.from({ length: BARS }, () => 0.12);
  return Array.from({ length: BARS }, (_, i) => {
    const from = Math.floor((i * peaks.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / BARS));
    return Math.max(0.12, ...peaks.slice(from, to));
  });
}

/**
 * The oldest track still waiting (owner, 30 Oct: the Floor's hero card): the play button beside a short waveform, and
 * where it is in the track under it. Playing it hands the rest of Up next to the player as the queue; while it
 * plays, a tap or the arrow keys on the waveform move through it.
 */
export function UpNextHero({ track, queue }: { track: Hero; queue: Hero[] }) {
  const { current, playing, buffering, time, duration, play, toggle, seek } = usePlayer();
  const on = current?.id === track.id;
  const length = on && duration ? duration : (track.duration ?? 0);
  const progress = on && length ? time / length : 0;
  const shape = bars(track.peaks);
  const start = () => (on ? toggle() : play(toPlayer(track), [track, ...queue.filter((q) => q.id !== track.id)].map(toPlayer)));
  return (
    // The play button centres on the waveform bar (36px), not on the bar plus the times under it (owner, 31 Oct).
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={start}
        aria-label={on && playing ? `Pause ${track.title}` : `Play ${track.title}`}
        className="-mt-1 grid size-11 shrink-0 place-items-center rounded-full bg-lime text-ink transition-transform duration-100 active:scale-95 motion-reduce:active:scale-100"
      >
        <PlayIcon playing={on && (playing || buffering)} className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
      <div
        role={on ? "slider" : undefined}
        tabIndex={on ? 0 : undefined}
        aria-label={on ? `Seek ${track.title}` : undefined}
        aria-valuemin={on ? 0 : undefined}
        aria-valuemax={on ? 100 : undefined}
        aria-valuenow={on ? Math.round(progress * 100) : undefined}
        aria-valuetext={on ? `${fmtTime(time)} of ${fmtTime(length)}` : undefined}
        aria-hidden={on ? undefined : true}
        onClick={(e) => {
          if (!on) return;
          const r = e.currentTarget.getBoundingClientRect();
          seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
        }}
        onKeyDown={(e) => {
          if (!on) return;
          const step = e.shiftKey ? 0.1 : 0.02;
          if (e.key === "ArrowRight") seek(Math.min(1, progress + step));
          else if (e.key === "ArrowLeft") seek(Math.max(0, progress - step));
          else return;
          e.preventDefault();
        }}
        className={`flex h-9 items-center gap-[2px] ${on ? "cursor-pointer" : ""}`}
      >
        {shape.map((p, i) => (
          <span key={i} className={`flex-1 rounded-[2px] ${i / BARS < progress ? "bg-lime" : "bg-line-2"}`} style={{ height: `${Math.round(p * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint tnum">
        <span>{fmtTime(on ? time : 0)}</span>
        <span>{fmtTime(length || null)}</span>
      </div>
      </div>
    </div>
  );
}
