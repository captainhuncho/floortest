"use client";

import Link from "next/link";
import { BufferRing, PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";

/** Phones (Figma "Waveform Block" + "Review Controls"): big waveform, previous, -15s, play, +15s, next. */
export function MobileTransport({ track, prevHref, nextHref }: { track: PlayerTrack; prevHref: string | null; nextHref: string | null }) {
  const { current, playing, buffering, time, duration, play, toggle, seek, seekBy } = usePlayer();
  const on = current?.id === track.id;
  const d = (on && duration) || track.duration || 0;
  const skip = "grid size-11 place-items-center";
  const jump = "grid h-11 min-w-11 place-items-center rounded-md bg-ink-2 px-2 text-[11px] normal-case text-bone tnum";
  return (
    <div >
      <div className="flex flex-col gap-2.5 py-3.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-bone tnum">{on ? fmtTime(time) : "0:00"}</span>
          <span className="text-faint tnum">{fmtTime(d)}</span>
        </div>
        <div className="py-2">
          <Waveform peaks={track.peaks} height={60} progress={on && d ? time / d : 0} duration={d} onSeek={on ? seek : (f) => (play(track), setTimeout(() => seek(f), 250))} label={`Seek ${track.title}`} />
        </div>
      </div>
      <div className="flex items-center justify-between px-3">
        {prevHref ? (
          <Link href={prevHref} replace scroll={false} aria-label="Previous track" className={skip}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/skip-back.svg" alt="" className="size-5" />
          </Link>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <span className={`${skip} opacity-30`}><img src="/icons/skip-back.svg" alt="" className="size-5" /></span>
        )}
        <button onClick={() => (on ? seekBy(-15) : play(track))} className={jump}>
          −15s<span className="sr-only">, back 15 seconds</span>
        </button>
        <button onClick={() => (on ? toggle() : play(track))} className="play-dot relative grid size-14 place-items-center rounded-full" aria-label={on && playing ? "Pause" : "Play"} aria-busy={on && buffering} data-buffering={on && buffering ? "" : undefined}>
          <PlayIcon playing={on && playing} className="size-5" />
          <BufferRing className="-inset-[5px] text-bone" />
        </button>
        <button onClick={() => (on ? seekBy(15) : play(track))} className={jump}>
          +15s<span className="sr-only">, forward 15 seconds</span>
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
