"use client";

import { BufferRing, PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";

export function DetailPlayer({ track }: { track: PlayerTrack }) {
  const { current, playing, buffering, time, duration, play, seek } = usePlayer();
  const isCurrent = current?.id === track.id;
  const loading = isCurrent && buffering;
  const d = (isCurrent && duration) || track.duration || 0;
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => play(track)}
        className="relative grid h-12 w-12 shrink-0 place-items-center play-dot rounded-full transition hover:scale-105"
        aria-label={isCurrent && playing ? "Pause" : "Play"}
        aria-busy={loading || undefined}
        data-buffering={loading ? "" : undefined}
      >
        <PlayIcon playing={isCurrent && playing} className="h-5 w-5" />
        <BufferRing className="-inset-[5px] text-bone" />
      </button>
      <div className="min-w-0 flex-1">
        <Waveform peaks={track.peaks} height={52} progress={isCurrent && d ? time / d : 0} duration={d} onSeek={isCurrent ? seek : undefined} />
        <div className="mt-1 flex justify-between text-xs text-mute tnum">
          <span>{isCurrent ? fmtTime(time) : "0:00"}</span>
          <span>{fmtTime(d)}</span>
        </div>
      </div>
    </div>
  );
}
