"use client";

import { PlayIcon, usePlayer } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";

type Hero = { id: number; title: string; artist: string; peaks: number[] | null; duration: number | null; played: boolean };

/**
 * The oldest track still waiting, big (owner, 30 Oct: the Floor's hero card): its waveform with the play button on top,
 * and where it is in the track under it. Playing it hands the rest of Up next to the player as the queue.
 */
export function UpNextHero({ track, queue }: { track: Hero; queue: Hero[] }) {
  const { current, playing, buffering, time, duration, play, toggle, seek } = usePlayer();
  const on = current?.id === track.id;
  const length = on && duration ? duration : (track.duration ?? 0);
  const progress = on && length ? time / length : 0;
  return (
    <div className="relative">
      <Waveform peaks={track.peaks} progress={progress} height={88} duration={length || undefined} onSeek={on ? seek : undefined} label={`Seek ${track.title}`} />
      <button
        type="button"
        onClick={() => (on ? toggle() : play(toPlayer(track), [track, ...queue.filter((q) => q.id !== track.id)].map(toPlayer)))}
        aria-label={on && playing ? `Pause ${track.title}` : `Play ${track.title}`}
        className="absolute left-1/2 top-[44px] grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-lime text-ink shadow-[0_0_0_5px_var(--color-ink-3)] transition-transform duration-100 active:scale-95 motion-reduce:active:scale-100"
      >
        <PlayIcon playing={on && (playing || buffering)} className="size-4" />
      </button>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-faint tnum">
        <span>{fmtTime(on ? time : 0)}</span>
        <span>{fmtTime(length || null)}</span>
      </div>
    </div>
  );
}
