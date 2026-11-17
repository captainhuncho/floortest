"use client";

import Link from "next/link";
import { useEffect, useId, useSyncExternalStore } from "react";
import { useModalDialog } from "@/components/Dialog";
import { BufferRing, PlayIcon, PlayerClock, PlayerWaveform, usePlayer } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { CONTROL, KeepHeart, SkipIcon, VolumeControl, trackHref } from "./PlayerBars";
import { playerExpanded, setPlayerExpanded, subscribePlayerExpanded } from "./playerExpandedStore";

const close = () => setPlayerExpanded(false);

/**
 * The expanded player (owner's pick, 16 Nov, option 30). Opened from the laptop bar's title or chevron, or the phone's
 * mini player title. From 1024px a centred card over the dimmed page; under that the whole window. The same modal
 * behaviour as every pop-up (components/Dialog): focus stays inside and goes back to what opened it, Escape and Close
 * shut it. It plays what the bar plays: nothing in here loads anything.
 */
export function PlayerExpanded() {
  const { current, playing, buffering, toggle, duration, seek, skip, hasNext, hasPrev, upNext, play } = usePlayer();
  const wanted = useSyncExternalStore(subscribePlayerExpanded, playerExpanded, () => false);
  const open = wanted && !!current;
  const { modalProps } = useModalDialog(open, close);
  const titleId = useId();
  // The track went away while open (a sign-out, the list emptied): the flag follows, so it can't reopen by itself.
  useEffect(() => {
    if (wanted && !current) close();
  }, [wanted, current]);
  const d = duration || current?.duration || 0;

  return (
    <dialog aria-labelledby={titleId} data-player-expanded className="ft-player" {...modalProps}>
      {current && (
        <div className="flex h-full max-h-[inherit] flex-col overflow-y-auto overscroll-contain min-[1024px]:flex-row min-[1024px]:overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col gap-5 p-5 pt-[max(1.25rem,env(safe-area-inset-top))] min-[1024px]:p-7">
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/mini-art.svg" alt="" className="size-20 shrink-0 rounded-[16px] min-[1024px]:size-24" />
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-[12px] text-mute">Now playing</p>
                <h2 id={titleId} className="mt-0.5 text-[22px] font-semibold leading-7 tracking-[-0.02em] text-bone [overflow-wrap:anywhere]">
                  {current.title}
                </h2>
                {current.artist && <p className="mt-0.5 truncate text-[15px] text-mute">{current.artist}</p>}
              </div>
              <button type="button" onClick={close} aria-label="Close player" className={`${CONTROL} -mr-2 -mt-1`}>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>

            <p className="text-mute">
              <PlayerClock className="tnum text-[38px] font-semibold leading-none tracking-[-0.03em] text-bone" />
              <span className="tnum text-[15px]"> / {fmtTime(d)}</span>
            </p>
            <PlayerWaveform on length={d} peaks={current.peaks} onSeek={seek} height={150} label={`Seek ${current.title}`} />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => skip(-1)} disabled={!hasPrev} aria-label="Previous track" className={CONTROL}>
                  <SkipIcon back />
                </button>
                <button
                  type="button"
                  data-autofocus
                  onClick={toggle}
                  aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
                  aria-busy={buffering || undefined}
                  data-buffering={buffering ? "" : undefined}
                  className="relative grid size-14 shrink-0 place-items-center rounded-full bg-bone text-ink transition-transform duration-100 active:scale-95"
                >
                  <PlayIcon playing={playing} className="size-5" />
                  <BufferRing className="-inset-1 text-bone" />
                </button>
                <button type="button" onClick={() => skip(1)} disabled={!hasNext} aria-label="Next track" className={CONTROL}>
                  <SkipIcon />
                </button>
              </span>
              <span className="flex items-center gap-1">
                {current.decision !== undefined && <KeepHeart track={current} />}
                <span className="hidden min-[1024px]:block">
                  <VolumeControl />
                </span>
              </span>
            </div>

            <Link href={trackHref(current)} onClick={close} className="inline-flex min-h-11 items-center self-start text-[13px] font-semibold text-mute underline-offset-4 hover:text-bone hover:underline">
              {current.src ? "Open in Projects" : "Open in Queue"}
            </Link>
          </div>

          <section aria-label="Up next" className="flex shrink-0 flex-col border-t border-(--glass-line) p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] min-[1024px]:w-[240px] min-[1024px]:overflow-y-auto min-[1024px]:border-l min-[1024px]:border-t-0">
            <h3 className="px-2 py-2 text-[12px] font-semibold text-mute">Up next</h3>
            {upNext.length === 0 ? (
              <p className="px-2 pb-2 text-[13px] text-mute">Nothing after this one.</p>
            ) : (
              <ol className="flex flex-col gap-0.5">
                {upNext.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => play(t)} aria-label={`Play ${t.title}`} className="flex min-h-11 w-full flex-col justify-center rounded-[11px] px-2 py-1.5 text-left transition-colors hover:bg-(--glass-on)">
                      <span className="w-full truncate text-[13px] font-medium text-bone">{t.title}</span>
                      {t.artist && <span className="w-full truncate text-[12px] text-mute">{t.artist}</span>}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
