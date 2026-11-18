"use client";

import { useEffect, useRef, useTransition } from "react";
import { BufferRing, PlayIcon, PlayerClock, PlayerWaveform, usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { VolumeNote } from "@/components/VolumeNote";
import { fmtTime } from "@/lib/format";
import { useRenderProbe } from "@/lib/render-probe";
import { clearDecision, decideTrack, undoDecision } from "./actions/review";
import { setPlayerExpanded } from "./playerExpandedStore";

/** Where the title leads: the track in the Queue, or Projects for the desk's own music. */
export const trackHref = (t: PlayerTrack) => (t.src ? "/dashboard/projects" : `/dashboard/review?view=queue&s=all&t=${t.id}`);

/** A control in a floating bar: a 44px target, quiet until pressed. */
export const CONTROL = "grid size-11 shrink-0 place-items-center rounded-full text-mute transition-colors duration-100 hover:text-bone disabled:opacity-35 disabled:hover:text-mute";

export function SkipIcon({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 ${back ? "-scale-x-100" : ""}`} fill="currentColor" aria-hidden>
      <path d="M2.5 3.2v9.6a.7.7 0 0 0 1.1.6l6.6-4.8a.7.7 0 0 0 0-1.2L3.6 2.6a.7.7 0 0 0-1.1.6Z" />
      <rect x="11.5" y="2.5" width="2" height="11" rx="1" />
    </svg>
  );
}

/**
 * Keep, as a heart, for the loaded track. The same server actions as the Queue's Keep (actions/review.ts): the screen
 * changes at once and goes back, with a message, if the server says no. Kept: pressing again takes it out of Kept.
 */
export function KeepHeart({ track }: { track: PlayerTrack }) {
  const { markDecision } = usePlayer();
  const toast = useToast();
  const [busy, start] = useTransition();
  // A second tap before the first answer comes back sends nothing.
  const sending = useRef(false);
  const kept = track.decision === "kept";
  const press = () => {
    if (busy || sending.current) return;
    sending.current = true;
    const before = track.decision ?? null;
    const failed = () => {
      markDecision(track.id, before);
      toast.show({ message: `Couldn't save that for “${track.title}”. Nothing changed. Try again.`, tone: "error" });
    };
    markDecision(track.id, kept ? null : "kept");
    start(async () => {
      try {
        if (kept) {
          await clearDecision(track.id);
          toast.show({
            message: `“${track.title}” is back in Needs review`,
            action: {
              label: "Undo",
              run: async () => {
                markDecision(track.id, "kept");
                await decideTrack(track.id, "kept");
              },
            },
          });
          return;
        }
        const token = await decideTrack(track.id, "kept");
        // No token: the desk owner's or an admin's call stands, or this desk is read-only here.
        if (!token) return failed();
        toast.show({
          message: `“${track.title}” added to Prepare for set`,
          action: {
            label: "Undo",
            run: async () => {
              markDecision(track.id, token.prev.decision);
              await undoDecision(token);
            },
          },
        });
      } catch {
        failed();
      } finally {
        sending.current = false;
      }
    });
  };
  return (
    <button type="button" data-heart onClick={press} aria-pressed={kept} aria-label={kept ? `Take ${track.title} out of Kept` : `Keep ${track.title}`} className={`${CONTROL} ${kept ? "text-lime hover:text-lime" : ""}`}>
      <svg viewBox="0 0 24 24" className="size-5" fill={kept ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
        <path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z" />
      </svg>
    </button>
  );
}

/** The slider's width, and its thumb's, so the level bubble can sit over the thumb. */
const SLIDER_PX = 84;
const THUMB_PX = 16;

/**
 * Laptops: a speaker button (mute). Pointing at it, or reaching it with the keyboard, slides out the slider with the
 * level over its thumb (owner, 16 Nov: no level on show by default). Screens with no hover always show the slider.
 * The same volume the keys change (Shift+↑ / Shift+↓, M), remembered on this device. Phones have none: they use their
 * own buttons, and iOS ignores a page's volume.
 */
function VolumeControl() {
  const { volume, muted, setVolume } = usePlayer();
  const level = muted ? 0 : volume;
  const percent = `${Math.round(level * 100)}%`;
  const shown = "group-hover/vol:opacity-100 group-focus-within/vol:opacity-100";
  return (
    <span className="group/vol relative flex shrink-0 items-center">
      <button type="button" onClick={() => setVolume(volume, !muted)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} className={CONTROL}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9.5h3l4.5-3.7v12.4L7 14.5H4z" fill="currentColor" />
          {level === 0 ? <path d="m16 9.5 5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11" />}
        </svg>
      </button>
      <span
        className={`flex w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-150 ease-out group-hover/vol:w-[84px] group-focus-within/vol:w-[84px] motion-reduce:transition-none [@media(hover:none)]:w-[84px] [@media(hover:none)]:opacity-100 ${shown}`}
      >
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={level}
          onChange={(e) => setVolume(Number(e.target.value), false)}
          aria-label="Volume"
          aria-valuetext={percent}
          className="h-11 w-[84px] shrink-0 cursor-pointer accent-bone"
        />
      </span>
      <span
        aria-hidden
        style={{ left: `calc(2.75rem + ${THUMB_PX / 2}px + ${level * (SLIDER_PX - THUMB_PX)}px)` }}
        className={`pointer-events-none absolute bottom-full -translate-x-1/2 rounded-md bg-card px-1.5 py-0.5 text-[11px] font-semibold text-bone opacity-0 shadow-md tnum transition-opacity duration-150 motion-reduce:transition-none ${shown}`}
      >
        {percent}
      </span>
    </span>
  );
}

/** The cover is the play button: the art with a play or pause mark on it, and the buffering ring while audio loads. */
export function CoverPlay({ focusFirst = false }: { focusFirst?: boolean }) {
  const { current, playing, buffering, toggle } = usePlayer();
  if (!current) return null;
  return (
    <button
      type="button"
      data-autofocus={focusFirst ? "" : undefined}
      onClick={toggle}
      className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[10px]"
      aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
      aria-busy={buffering || undefined}
      data-buffering={buffering ? "" : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/mini-art.svg" alt="" className="absolute inset-0 size-full" />
      <span className="relative grid size-7 place-items-center rounded-full bg-black/55 text-white">
        <PlayIcon playing={playing} className="size-3.5" />
        <BufferRing className="-inset-[3px] text-white" />
      </span>
    </button>
  );
}

/**
 * Phones: the top half of the bottom pair (BottomPair.tsx), over the menu. Cover plays and pauses; the title opens the
 * expanded player (PlayerExpanded.tsx) and the wave under it only seeks, so one tap never does both; then Keep and Next.
 */
export function MiniPlayer() {
  const { current, duration, seek, skip, hasNext, volume, muted, volumeTouched } = usePlayer();
  if (!current) return null;
  const d = duration || current.duration || 0;
  return (
    <section data-mini-player aria-label="Now playing" className="glass flex h-16 items-center gap-2.5 rounded-[18px] py-2.5 pl-2.5 pr-1">
      <CoverPlay />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="relative flex">
          {/* A 44px target with the wave left where it is: the link's own box reaches the player's top edge, and its
              ::before carries the target 14px above the player. */}
          <button
            type="button"
            data-open-player
            onClick={() => setPlayerExpanded(true)}
            aria-haspopup="dialog"
            aria-label={`Open the player: ${current.title}${current.artist ? `, ${current.artist}` : ""}`}
            className="relative -mt-2.5 block min-w-0 flex-1 pt-2.5 text-left text-[13px] leading-5 text-mute before:absolute before:inset-x-0 before:-top-3.5 before:h-3.5"
          >
            <span className="block truncate">
              <span className="font-semibold tracking-[-0.2px] text-bone">{current.title}</span>
              {current.artist && <> · {current.artist}</>}
            </span>
          </button>
          {/* Over the end of the title for the moment it shows, so the title keeps the whole line the rest of the time.
              It never takes a tap: the title under it stays tappable. */}
          <VolumeNote volume={volume} muted={muted} touched={volumeTouched} className="pointer-events-none absolute right-0 top-0.5 rounded bg-card px-1" />
        </span>
        <PlayerWaveform on length={d} peaks={current.peaks} onSeek={seek} height={18} label={`Seek ${current.title}`} />
      </div>
      <span className="flex shrink-0 items-center">
        {current.decision !== undefined && <KeepHeart track={current} />}
        <button type="button" onClick={() => skip(1)} disabled={!hasNext} aria-label="Next track" className={CONTROL}>
          <SkipIcon />
        </button>
      </span>
    </section>
  );
}

/**
 * Laptops: one compact bar floating over the page, centred in the main column (never across the menu rail) and as wide
 * as what it holds, with the page fading under it. Under 1024px the wave and times step out.
 */
export function PlayerBar() {
  const { current, duration, seek, skip, hasNext, hasPrev, failures, volume, muted, volumeTouched } = usePlayer();
  useRenderProbe("PlayerBar");
  const toast = useToast();
  useEffect(() => {
    if (failures) toast.show({ message: "This track won't play right now. Check your connection, then press play again.", tone: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per failure, not when the toast API changes
  }, [failures]);
  if (!current) return null;
  const d = duration || current.duration || 0;
  return (
    <>
      <div aria-hidden className="bottom-fade absolute inset-x-0 bottom-0 z-20 hidden h-32 md:block" />
      <section
        data-player-bar
        aria-label="Now playing"
        className="glass glass-float absolute inset-x-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 mx-auto hidden w-fit items-center gap-2 rounded-[18px] py-[7px] pl-[7px] pr-2 md:flex"
      >
        <CoverPlay />
        <button
          type="button"
          data-open-player
          onClick={() => setPlayerExpanded(true)}
          aria-haspopup="dialog"
          aria-label={`Open the player: ${current.title}${current.artist ? `, ${current.artist}` : ""}`}
          className="ml-1 flex h-11 w-[150px] min-w-0 shrink-0 flex-col justify-center text-left"
        >
          <span className="w-full truncate text-sm font-medium">{current.title}</span>
          <span className="w-full truncate text-[13px] text-mute">{current.artist}</span>
        </button>
        <div className="hidden w-[220px] shrink-0 min-[1024px]:block">
          <PlayerWaveform on length={d} peaks={current.peaks} onSeek={seek} height={28} label={`Seek ${current.title}`} />
        </div>
        <span className="hidden shrink-0 whitespace-nowrap px-1 text-[13px] text-mute min-[1024px]:block">
          <PlayerClock className="tnum" /> / <span className="tnum">{fmtTime(d)}</span>
        </span>
        <span className="flex shrink-0 items-center">
          <button type="button" onClick={() => skip(-1)} disabled={!hasPrev} aria-label="Previous track" className={CONTROL}>
            <SkipIcon back />
          </button>
          <button type="button" onClick={() => skip(1)} disabled={!hasNext} aria-label="Next track" className={CONTROL}>
            <SkipIcon />
          </button>
        </span>
        {current.decision !== undefined && <KeepHeart track={current} />}
        {/* The words say the level for a moment after a volume key, over the speaker so the bar keeps its width. */}
        <VolumeNote volume={volume} muted={muted} touched={volumeTouched} className="pointer-events-none absolute -top-7 right-2 rounded-md bg-card px-1.5 py-0.5" />
        <VolumeControl />
        <button type="button" onClick={() => setPlayerExpanded(true)} aria-haspopup="dialog" aria-label="Open the player" className={CONTROL}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>
      </section>
    </>
  );
}
