"use client";

import Link from "next/link";
import { PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";

/** Phones (Figma "Waveform Block" + "Review Controls"): big waveform, previous, -15s, play, +15s, next. */
export function MobileTransport({ track, prevHref, nextHref }: { track: PlayerTrack; prevHref: string | null; nextHref: string | null }) {
  const { current, playing, time, duration, play, toggle, seek, seekBy } = usePlayer();
  const on = current?.id === track.id;
  const d = (on && duration) || track.duration || 0;
  const skip = "grid size-9 place-items-center";
  return (
    <div className="font-[family-name:var(--font-stage-mono)]">
      <div className="flex flex-col gap-2.5 py-3.5">
        <div className="flex justify-between text-[9px]">
          <span className="text-white tnum">{on ? fmtTime(time) : "0:00"}</span>
          <span className="text-[#6b6e65] tnum">{fmtTime(d)}</span>
        </div>
        <div className="py-2">
          <Waveform peaks={track.peaks} height={60} progress={on && d ? time / d : 0} onSeek={on ? seek : (f) => (play(track), setTimeout(() => seek(f), 250))} label={`Seek ${track.title}`} />
        </div>
      </div>
      <div className="flex items-center justify-between px-6">
        {prevHref ? (
          <Link href={prevHref} replace scroll={false} aria-label="Previous track" className={skip}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/skip-back.svg" alt="" className="size-5" />
          </Link>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <span className={`${skip} opacity-30`}><img src="/icons/skip-back.svg" alt="" className="size-5" /></span>
        )}
        <button onClick={() => (on ? seekBy(-15) : play(track))} className="rounded-md bg-[#171815] p-2 text-[10px] text-[#f1f1eb]" aria-label="Back 15 seconds">
          -15S
        </button>
        <button onClick={() => (on ? toggle() : play(track))} className="grid size-14 place-items-center rounded-full bg-white text-[#10110f]" aria-label={on && playing ? "Pause" : "Play"}>
          <PlayIcon playing={on && playing} className="size-5" />
        </button>
        <button onClick={() => (on ? seekBy(15) : play(track))} className="rounded-md bg-[#171815] p-2 text-[10px] text-[#f1f1eb]" aria-label="Forward 15 seconds">
          +15S
        </button>
        {nextHref ? (
          <Link href={nextHref} replace scroll={false} aria-label="Next track" className={skip}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/skip-forward.svg" alt="" className="size-5" />
          </Link>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <span className={`${skip} opacity-30`}><img src="/icons/skip-forward.svg" alt="" className="size-5" /></span>
        )}
      </div>
    </div>
  );
}
