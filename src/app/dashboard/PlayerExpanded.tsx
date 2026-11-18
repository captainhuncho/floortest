"use client";

import Link from "next/link";
import { useEffect, useId, useSyncExternalStore } from "react";
import { useModalDialog } from "@/components/Dialog";
import { PlayerClock, PlayerWaveform, usePlayer, type PlayerTrack } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { CONTROL, CoverPlay, KeepHeart, SkipIcon, trackHref } from "./PlayerBars";
import { PlayerActions } from "./PlayerExpandedActions";
import { playerExpanded, setPlayerExpanded, subscribePlayerExpanded } from "./playerExpandedStore";

const close = () => setPlayerExpanded(false);

/** How far Back and Forward jump, in seconds. */
const JUMP = 15;

/** What the top label says: where the loaded track sits. */
const sourceLabel = (t: PlayerTrack) =>
  t.src ? "Playing from Projects" : t.decision === "kept" ? "Playing from Kept" : t.decision === "passed" ? "Playing from Not for me" : t.decision === null ? "Waiting" : "Now playing";

/** Kept and waiting tracks are counted in Up next ("3 more waiting"); anything else has no count. */
const bucket = (t: PlayerTrack) => (t.decision === "kept" ? "kept" : t.decision === null ? "waiting" : null);

function JumpIcon({ back = false }: { back?: boolean }) {
  return (
    <span className="relative grid place-items-center">
      <svg viewBox="0 0 24 24" className={`size-7 ${back ? "-scale-x-100" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 12a8 8 0 1 1-2.6-5.9" />
        <path d="M20 4v4h-4" />
      </svg>
      <span aria-hidden className="absolute text-[8.5px] font-bold tnum">
        {JUMP}
      </span>
    </span>
  );
}

/** Laptops: the speaker (mute), the slider and the level, always on show (Design: never behind a hover). */
function VolumeRow() {
  const { volume, muted, setVolume } = usePlayer();
  const level = muted ? 0 : volume;
  const percent = `${Math.round(level * 100)}%`;
  return (
    <div className="hidden items-center justify-center gap-2 min-[1024px]:flex">
      <button type="button" onClick={() => setVolume(volume, !muted)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} className={CONTROL}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9.5h3l4.5-3.7v12.4L7 14.5H4z" fill="currentColor" />
          {level === 0 ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11" />}
        </svg>
      </button>
      <input type="range" min={0} max={1} step={0.05} value={level} onChange={(e) => setVolume(Number(e.target.value), false)} aria-label="Volume" aria-valuetext={percent} className="h-11 w-[200px] cursor-pointer accent-bone" />
      <span aria-hidden className="w-10 text-[12px] text-mute tnum">
        {percent}
      </span>
    </div>
  );
}

/**
 * The expanded player (Design options 27 to 30: phone full player from 27, the laptop card from 30). Opened from the laptop
 * bar's title or chevron, or the phone's mini player title. From 1024px a centred card over the dimmed page; under that
 * the whole window. The same modal behaviour as every pop-up (components/Dialog): focus stays inside and goes back to
 * what opened it, Escape and the chevron shut it. It plays what the bar plays: nothing in here loads anything.
 */
export function PlayerExpanded() {
  const { current, duration, seek, seekBy, skip, hasNext, hasPrev, upNext, play } = usePlayer();
  const wanted = useSyncExternalStore(subscribePlayerExpanded, playerExpanded, () => false);
  const open = wanted && !!current;
  const { modalProps } = useModalDialog(open, close);
  const titleId = useId();
  // The track went away while open (a sign-out, the list emptied): the flag follows, so it can't reopen by itself.
  useEffect(() => {
    if (wanted && !current) close();
  }, [wanted, current]);
  const d = duration || current?.duration || 0;
  const kind = current ? bucket(current) : null;
  const more = kind ? upNext.filter((t) => bucket(t) === kind).length : 0;

  return (
    <dialog aria-labelledby={titleId} data-player-expanded className="ft-player" {...modalProps}>
      {current && (
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="grid shrink-0 grid-cols-[2.75rem_1fr_2.75rem] items-center px-2 pt-[max(0.625rem,env(safe-area-inset-top))]">
            <button type="button" onClick={close} aria-label="Close player" className={CONTROL}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <p className="truncate text-center text-[12px] font-semibold text-mute">{sourceLabel(current)}</p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-[18px] pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-1.5 min-[1024px]:grid min-[1024px]:grid-cols-[minmax(0,1fr)_240px] min-[1024px]:gap-[26px] min-[1024px]:overflow-hidden min-[1024px]:px-[26px] min-[1024px]:pb-[22px] min-[1024px]:pt-2.5">
            <div className="flex min-w-0 flex-col gap-3 min-[1024px]:justify-center min-[1024px]:gap-3.5">
              <p className="flex items-baseline justify-center gap-2.5 tnum">
                <PlayerClock className="text-[28px] font-bold leading-none text-bone" />
                <span className="text-[18px] leading-none text-mute">{fmtTime(d)}</span>
              </p>
              <PlayerWaveform on length={d} peaks={current.peaks} onSeek={seek} height={150} label={`Seek ${current.title}`} />

              <div className="flex items-center gap-2.5">
                <CoverPlay focusFirst />
                {/* The title opens the track's page, whatever its state (Design, 18 Nov). */}
                <Link href={trackHref(current)} onClick={close} data-open-track className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md">
                  <h2 id={titleId} className="truncate text-[18px] font-bold leading-6 text-bone">
                    {current.title}
                  </h2>
                  {current.artist && <span className="truncate text-[13px] text-mute">{current.artist}</span>}
                </Link>
                {current.decision !== undefined && <KeepHeart track={current} />}
              </div>

              <div role="group" aria-label="Playback" className="flex items-center justify-between px-2.5">
                <button type="button" onClick={() => skip(-1)} disabled={!hasPrev} aria-label="Previous track" className={CONTROL}>
                  <SkipIcon back />
                </button>
                <button type="button" onClick={() => seekBy(-JUMP)} aria-label={`Back ${JUMP} seconds`} className={CONTROL}>
                  <JumpIcon back />
                </button>
                <button type="button" onClick={() => seekBy(JUMP)} aria-label={`Forward ${JUMP} seconds`} className={CONTROL}>
                  <JumpIcon />
                </button>
                <button type="button" onClick={() => skip(1)} disabled={!hasNext} aria-label="Next track" className={CONTROL}>
                  <SkipIcon />
                </button>
              </div>

              <VolumeRow />
              <PlayerActions key={current.id} track={current} onLeave={close} />
            </div>

            <section aria-label="Up next" className="flex shrink-0 flex-col min-[1024px]:min-h-0 min-[1024px]:overflow-y-auto min-[1024px]:border-l min-[1024px]:border-(--glass-line) min-[1024px]:pl-[18px]">
              <div className="flex items-center justify-between py-2">
                <h3 className="text-[12px] font-semibold text-mute">Up next</h3>
                {more > 0 && (
                  <span className="text-[11px] text-mute tnum">
                    {more} more {kind}
                  </span>
                )}
              </div>
              {upNext.length === 0 ? (
                <p className="pb-2 text-[13px] text-mute">Nothing after this one.</p>
              ) : (
                <ol className="flex flex-col">
                  {upNext.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => play(t)} aria-label={`Play ${t.title}`} className="-mx-1.5 flex min-h-14 w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-[11px] px-1.5 py-1.5 text-left transition-colors hover:bg-(--glass-on)">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icons/mini-art.svg" alt="" loading="lazy" className="size-10 shrink-0 rounded-[8px]" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[13px] font-medium text-bone">{t.title}</span>
                          {t.artist && <span className="truncate text-[12px] text-mute">{t.artist}</span>}
                        </span>
                        {!!t.duration && <span className="shrink-0 text-[12px] text-mute tnum">{fmtTime(t.duration)}</span>}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </dialog>
  );
}
