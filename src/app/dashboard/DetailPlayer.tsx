"use client";

import { PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";

export function DetailPlayer({ track }: { track: PlayerTrack }) {
  const { current, playing, time, duration, play, seek } = usePlayer();
  const isCurrent = current?.id === track.id;
  const d = (isCurrent && duration) || track.duration || 0;
  return (
    // Rule 15 Queue (28 Oct): the waveform gets the full width; a bordered 44px play button and the time sit under it.
    <div className="flex flex-col gap-3">
      {/* A tap anywhere on the waveform plays from there, playing or not (phones used to have this on their own transport). */}
      <Waveform
        peaks={track.peaks}
        height={72}
        progress={isCurrent && d ? time / d : 0}
        duration={d}
        onSeek={isCurrent ? seek : (f) => (play(track), setTimeout(() => seek(f), 250))}
        label={`Seek ${track.title}`}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={() => play(track)}
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-bone hover:border-mute hover:bg-ink-4"
          aria-label={isCurrent && playing ? "Pause" : "Play"}
        >
          <PlayIcon playing={isCurrent && playing} className="size-3.5" />
        </button>
        <span className="font-mono text-[13px] text-bone tnum">
          {isCurrent ? fmtTime(time) : "0:00"} <span className="text-faint">/ {fmtTime(d)}</span>
        </span>
        {track.played && <span className="text-[13px] text-mute">Listened. The sender can see that.</span>}
      </div>
    </div>
  );
}
