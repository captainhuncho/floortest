"use client";

import Link from "next/link";
import { useEffect, useId, useSyncExternalStore } from "react";
import { useModalDialog } from "@/components/Dialog";
import { BufferRing, PlayerClock, type PlayerTrack, PlayerWaveform, PlayIcon, usePlayer } from "@/components/Player";
import { useToastHost } from "@/components/Toast";
import { fmtTime } from "@/lib/format";
import { CONTROL, Cover, KeepHeart, SkipIcon, trackHref } from "./PlayerBars";
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

/** Back or forward 15 seconds. Phones: either side of play or pause. Laptops: the row under Keep and Not for me. */
function JumpButton({ back = false, className = "" }: { back?: boolean; className?: string }) {
  const { seekBy } = usePlayer();
  return (
    <button type="button" onClick={() => seekBy(back ? -JUMP : JUMP)} aria-label={`${back ? "Back" : "Forward"} ${JUMP} seconds`} className={`${CONTROL} ${className}`}>
      <JumpIcon back={back} />
    </button>
  );
}

/**
 * Laptops: the speaker (mute) in the bottom row. The slider and its level slide out when the pointer is on the speaker
 * or the keyboard reaches it, as in the floating bar (owner, 18 Nov: "the volume, should take the rule of putting the
 * mouse or trackpad before it pops out"). Screens with no hover always show it, so nothing depends on hovering.
 */
function Volume() {
  const { volume, muted, setVolume } = usePlayer();
  const level = muted ? 0 : volume;
  const percent = `${Math.round(level * 100)}%`;
  return (
    <div className="group/vol flex min-w-0 items-center">
      <button type="button" onClick={() => setVolume(volume, !muted)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} className={CONTROL}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9.5h3l4.5-3.7v12.4L7 14.5H4z" fill="currentColor" />
          {level === 0 ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11" />}
        </svg>
      </button>
      {/* Shut until the pointer is on the speaker or the keyboard reaches it; always open where there is no hover. */}
      <span
        data-volume-slide
        className="flex w-0 items-center gap-2 overflow-hidden opacity-0 transition-[width,opacity] duration-150 ease-out group-hover/vol:w-[208px] group-hover/vol:opacity-100 group-focus-within/vol:w-[208px] group-focus-within/vol:opacity-100 motion-reduce:transition-none [@media(hover:none)]:w-[208px] [@media(hover:none)]:opacity-100"
      >
        <input type="range" min={0} max={1} step={0.05} value={level} onChange={(e) => setVolume(Number(e.target.value), false)} aria-label="Volume" aria-valuetext={percent} className="h-11 w-40 shrink-0 cursor-pointer accent-bone" />
        <span aria-hidden className="w-10 shrink-0 text-[12px] text-mute tnum">
          {percent}
        </span>
      </span>
    </div>
  );
}

/**
 * Play or pause, in the middle of the playback row (owner, 18 Nov; the cover beside the title is art only in here). Focus starts on it when the player opens. The buffering ring shows while audio loads.
 */
function PlayPause() {
  const { current, playing, buffering, toggle } = usePlayer();
  if (!current) return null;
  return (
    <button
      type="button"
      data-autofocus
      onClick={toggle}
      aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
      aria-busy={buffering || undefined}
      data-buffering={buffering ? "" : undefined}
      className="relative grid size-14 shrink-0 place-items-center rounded-full bg-bone text-ink transition-transform duration-100 active:scale-95 motion-reduce:active:scale-100"
    >
      <PlayIcon playing={playing} className="size-5" />
      <BufferRing className="-inset-[3px] text-bone" />
    </button>
  );
}

/**
 * The expanded player (Design options 27 to 30: phone full player from 27, the laptop card from 30). Opened from the laptop
 * bar's title or chevron, or the phone's mini player title. From 1024px a centred card over the dimmed page; under that
 * the whole window. The same modal behaviour as every pop-up (components/Dialog): focus stays inside and goes back to
 * what opened it, Escape and the chevron shut it. It plays what the bar plays: nothing in here loads anything.
 */
export function PlayerExpanded() {
  const { current, duration, seek, skip, hasNext, hasPrev, upNext, play } = usePlayer();
  const wanted = useSyncExternalStore(subscribePlayerExpanded, playerExpanded, () => false);
  const open = wanted && !!current;
  const { modalProps } = useModalDialog(open, close);
  const toastHost = useToastHost();
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
      {/* Keep, Not for me and their Undo messages show here while the player is open: the page behind is covered and inert. */}
      {open && <div ref={toastHost} />}
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

          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-[18px] pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-1.5 min-[1024px]:grid min-[1024px]:grid-cols-[minmax(0,1fr)_240px] min-[1024px]:gap-[26px] min-[1024px]:overflow-hidden min-[1024px]:px-[26px] min-[1024px]:pb-[22px] min-[1024px]:pt-2.5">
            <div className="flex min-w-0 flex-col gap-5 min-[1024px]:justify-center min-[1024px]:gap-3.5 [@media(max-height:500px)]:gap-3">
              {/* Under 1024px (owner, 16 Nov: "space at the top of the player", so the wave has its moment): 56px of nothing
                  over the time, the time at the left at 30px, a 124px wave. Short screens (a phone on its side) get no space,
                  an 80px wave, a 44px cover and 12px gaps, so Keep and Not for me stay on screen. */}
              <div data-player-top className="flex flex-col gap-3 pt-14 min-[1024px]:gap-3.5 min-[1024px]:pt-0 [@media(max-height:500px)]:pt-0">
                <p className="flex items-baseline gap-2 tnum min-[1024px]:justify-center min-[1024px]:gap-2.5">
                  <PlayerClock className="text-[30px] font-bold leading-none text-bone min-[1024px]:text-[28px] [@media(max-height:500px)]:text-[28px]" />
                  <span className="text-[14px] leading-none text-mute min-[1024px]:text-[18px]">{fmtTime(d)}</span>
                </p>
                <PlayerWaveform on length={d} peaks={current.peaks} onSeek={seek} height={150} label={`Seek ${current.title}`} className="max-[1023.98px]:h-[124px]! [@media(max-height:500px)]:h-20!" />
              </div>

              <div className="flex items-center gap-3 min-[1024px]:gap-2.5">
                <Cover src={current.cover} data-player-cover className="size-14 shrink-0 rounded-xl min-[1024px]:size-11 min-[1024px]:rounded-[10px] [@media(max-height:500px)]:size-11" />
                {/* The title opens the track's page, whatever its state (Design, 18 Nov). */}
                <Link href={trackHref(current)} onClick={close} data-open-track className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md">
                  <h2 id={titleId} className="truncate text-[18px] font-bold leading-6 text-bone">
                    {current.title}
                  </h2>
                  {current.artist && <span className="truncate text-[13px] text-mute">{current.artist}</span>}
                </Link>
                {current.decision !== undefined && <KeepHeart track={current} />}
              </div>

              {/* Phones: Previous, Back 15, play or pause, Forward 15, Next (Design's pick 22). Laptops: the essentials close
                  together, Previous, play or pause, Next (owner, 18 Nov: "controls are too wide apart"). */}
              <div role="group" aria-label="Playback" className="flex items-center justify-center gap-3 min-[390px]:gap-5 min-[1024px]:gap-6">
                <button type="button" onClick={() => skip(-1)} disabled={!hasPrev} aria-label="Previous track" className={CONTROL}>
                  <SkipIcon back />
                </button>
                <JumpButton back className="min-[1024px]:hidden" />
                <PlayPause />
                <JumpButton className="min-[1024px]:hidden" />
                <button type="button" onClick={() => skip(1)} disabled={!hasNext} aria-label="Next track" className={CONTROL}>
                  <SkipIcon />
                </button>
              </div>

              <PlayerActions key={current.id} track={current} onLeave={close} />

              {/* Laptops, the rest below: back and forward 15 seconds, then the volume across the row. */}
              <div role="group" aria-label="More playback" className="hidden items-center gap-1 min-[1024px]:flex">
                <JumpButton back />
                <JumpButton />
                <Volume />
              </div>
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
                        <Cover src={t.cover} lazy className="size-10 shrink-0 rounded-[8px]" />
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
