"use client";

import { PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";

export function DetailPlayer({ track }: { track: PlayerTrack }) {
  const { current, playing, time, duration, play, seek } = usePlayer();
  const isCurrent = current?.id === track.id;
  const d = (isCurrent && duration) || track.duration || 0;
  return (
    // Redesign (30 Oct): the waveform gets the full width; under it the time, a round lime play button and the length.
    <div className="flex flex-col gap-2">
      {/* A tap anywhere on the waveform plays from there, playing or not (phones used to have this on their own transport). */}
      <Waveform
        peaks={track.peaks}
        height={88}
        progress={isCurrent && d ? time / d : 0}
        duration={d}
        onSeek={isCurrent ? seek : (f) => (play(track), setTimeout(() => seek(f), 250))}
        label={`Seek ${track.title}`}
      />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="text-[11.5px] text-mute tnum">{isCurrent ? fmtTime(time) : "0:00"}</span>
        <button
          onClick={() => play(track)}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-lime text-ink transition-transform duration-100 hover:bg-[#e2ff7a] active:scale-95 motion-reduce:active:scale-100"
          aria-label={isCurrent && playing ? "Pause" : "Play"}
        >
          <PlayIcon playing={isCurrent && playing} className="size-4" />
        </button>
        <span className="text-right text-[11.5px] text-mute tnum">{fmtTime(d)}</span>
      </div>
      {track.played && <p className="text-center text-[11.5px] text-mute">Listened. The sender can see that.</p>}
    </div>
  );
}
