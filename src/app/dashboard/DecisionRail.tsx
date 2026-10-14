"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { isTyping, usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { QuickReplies } from "./QuickReplies";
import { ReplyTemplates } from "./ReplyTemplates";
import { decideTrack, undoDecision } from "./actions/review";
import { stored, useDeviceState } from "@/components/useBrowserValue";
import { EASE_OUT, handoff, isShown } from "./ReviewHandoff";

/** Number keys jump through the track: 1 = a quarter in, 4 = near the end. */
const JUMPS: Record<string, number> = { "1": 0.25, "2": 0.5, "3": 0.75, "4": 0.9 };

type Props = {
  track: PlayerTrack & { decision: "kept" | "passed" | null };
  senderName: string;
  selfHref: string;
  next: { href: string; track: PlayerTrack } | null;
  prevHref: string | null;
  /** The Queue without a track open: where the review lands once nothing is waiting. */
  queueHref: string;
  /** In a Needs review view, the ids still waiting there (this track included); null in other views. */
  waiting: number[] | null;
  /** Phones with a track open: the buttons dock at the bottom of the screen, in thumb reach. */
  docked?: boolean;
  onReply: (fd: FormData) => Promise<void>;
};

/** How a decision was made: touch and tap animate; mouse clicks and keys (K / X) never do. */
type How = "touch" | "pointer" | "key";

/** A drag this far decides; a quick flick decides sooner (see the swipe handler). */
const LINE = 90;

/**
 * How many tracks would still wait after this one, or null outside Needs review. Tracks decided a moment ago whose
 * save hasn't refreshed the page yet don't count, so fast decisions still land on "All caught up.".
 */
const leftAfter = (ids: number[] | null, id: number) => (ids ? ids.filter((x) => x !== id && !handoff.decided.has(x)).length : null);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shownZone = () => [...document.querySelectorAll<HTMLElement>("[data-swipe-zone]")].find(isShown) ?? null;

/** Move the top card to x (transform only) and set the stamp: up to 0.6 short of the line, full once over it. */
function paint(zone: HTMLElement, x: number, reduce: boolean) {
  zone.style.transform = x ? (reduce ? `translateX(${x}px)` : `translateX(${x}px) rotate(${x / 40}deg)`) : "";
  const stamp = zone.querySelector<HTMLElement>("[data-stamp]");
  if (!stamp) return;
  const kind = x > 0 ? "keep" : x < 0 ? "pass" : "";
  if (stamp.dataset.kind !== kind) {
    stamp.dataset.kind = kind;
    stamp.textContent = kind === "keep" ? "KEEP" : kind === "pass" ? "NOT FOR ME" : "";
  }
  const a = Math.abs(x);
  stamp.style.opacity = a >= LINE ? "1" : String(Math.min(0.6, (a / LINE) * 0.6));
}

/** Short of the line: back to rest on the drawer curve, the stamp fading with it. */
function snapBack(zone: HTMLElement, reduce: boolean) {
  zone.style.transition = reduce ? "none" : "transform 250ms var(--ease-drawer)";
  const stamp = zone.querySelector<HTMLElement>("[data-stamp]");
  if (stamp) stamp.style.transition = "opacity 150ms var(--ease-out)";
  paint(zone, 0, reduce);
}

/** A decision is on its way: the card leaves on its side and stays gone; the rest of the panel fades until the next track renders. */
function flyOut(zone: HTMLElement, keep: boolean, reduce: boolean) {
  zone.closest("[data-review-panel]")?.setAttribute("data-leaving", "");
  if (reduce) {
    zone.style.transition = "opacity 200ms var(--ease-out)";
    zone.style.opacity = "0";
    return;
  }
  zone.style.transition = "transform 200ms var(--ease-out)";
  paint(zone, keep ? window.innerWidth : -window.innerWidth, reduce);
}

/** Back where it was: the save failed while this panel was still on screen. */
function restore(zone: HTMLElement) {
  zone.closest("[data-review-panel]")?.removeAttribute("data-leaving");
  zone.style.transition = "none";
  zone.style.opacity = "";
  paint(zone, 0, true);
}

export function DecisionRail({ track, senderName, selfHref, next, prevHref, queueHref, waiting, docked = false, onReply }: Props) {
  const router = useRouter();
  const player = usePlayer();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [replying, setReplying] = useState(false);
  // The swipe hint shows until the first swipe on this device.
  const [swiped, setSwiped] = useDeviceState(() => stored("ft:swiped") === "1", true);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // One decision per track (the next track arrives with its own rail). A ref, not a disabled state, so the buttons
  // never dim while it saves; `saving` only marks the group busy for assistive tech.
  const deciding = useRef(false);
  const [saving, setSaving] = useState(false);
  const lastPointer = useRef("mouse");

  // Close the composer when moving to another track.
  const [replyFor, setReplyFor] = useState(track.id);
  if (replyFor !== track.id) {
    setReplyFor(track.id);
    setReplying(false);
  }
  useEffect(() => {
    if (replying) replyRef.current?.focus();
  }, [replying]);

  const advance = useCallback(
    (wasPlaying: boolean) => {
      if (!next) return;
      router.replace(next.href, { scroll: false });
      if (wasPlaying) player.play(next.track);
    },
    [next, router, player],
  );

  const goCaughtUp = useCallback(() => {
    handoff.focus = "caught-up";
    router.replace(queueHref, { scroll: false });
  }, [router, queueHref]);

  // A decision that had nowhere to go (end of the view): once the page refreshes with nothing left waiting, it lands
  // on "All caught up." too. Runs when the refreshed list arrives.
  const checkCaughtUp = useRef(false);
  useEffect(() => {
    if (!checkCaughtUp.current || leftAfter(waiting, track.id) !== 0) return;
    checkCaughtUp.current = false;
    goCaughtUp();
  }, [waiting, track.id, goCaughtUp]);

  /**
   * Optimistic, like the List view: the next track opens at once and the save runs alongside. The save is a plain
   * call rather than an async transition, because React holds every transition (the route change included) until a
   * pending async one finishes. If it fails (or the call isn't this person's to change), the track comes back with a
   * toast; if they've already moved on from the next track, the toast offers a way back instead of pulling them.
   */
  const decide = useCallback(
    (d: "kept" | "passed", how: How) => {
      if (deciding.current) return;
      deciding.current = true;
      setSaving(true);
      const wasPlaying = player.current?.id === track.id && player.playing;
      const reduce = reducedMotion();
      const zone = how === "touch" ? shownZone() : null;
      const goes = leftAfter(waiting, track.id) === 0 ? "caught-up" : next ? "next" : "stay";
      if (zone) {
        if (goes === "stay") snapBack(zone, reduce);
        else flyOut(zone, d === "kept", reduce);
      }
      const same = track.decision === d;
      if (!same) handoff.decided.add(track.id);
      const outcome = d === "kept" ? `Kept “${track.title}”.` : `Not for me: “${track.title}”.`;
      const message = goes === "next" && next ? `${outcome} Now: “${next.track.title}”` : outcome;
      // Set before the save: the refreshed page may already show "All caught up." when it returns.
      if (goes === "caught-up") handoff.focus = "caught-up";
      if (goes === "next" && next) {
        handoff.enter = zone ? { id: next.track.id, dir: d === "kept" ? "keep" : "pass" } : null;
        handoff.focus = next.track.id;
        advance(wasPlaying);
      }

      const fail = (here: string, away: string) => {
        deciding.current = false;
        setSaving(false);
        handoff.decided.delete(track.id);
        handoff.enter = null;
        handoff.focus = null;
        if (zone?.isConnected) restore(zone);
        if (goes !== "next" || !next) return toast.show({ message: here });
        const there = new URL(next.href, window.location.href);
        if (window.location.pathname + window.location.search === there.pathname + there.search) {
          // Still on the track it moved to: bring this one back (playing again if it was).
          toast.show({ message: here });
          router.replace(selfHref, { scroll: false });
          if (wasPlaying) player.play(track);
        } else toast.show({ message: away, action: { label: "Open it", undoable: false, run: () => router.push(selfHref) } });
      };

      const save = same ? Promise.resolve(null) : decideTrack(track.id, d);
      save.then(
        (token) => {
          // No token for a real change: an owner's or A&R / Admin's call stands against a member.
          if (!same && !token) return fail("Only the owner or an A&R / Admin can change it.", `Only the owner or an A&R / Admin can change “${track.title}”.`);
          setSaving(false);
          // The refreshed page stops counting it by itself; until then it stays out of the waiting count.
          if (!same) setTimeout(() => handoff.decided.delete(track.id), 5000);
          // Focus was handed off before the save; the refreshed page may already have taken it.
          if (goes === "caught-up") router.replace(queueHref, { scroll: false });
          else if (goes === "stay") {
            deciding.current = false;
            checkCaughtUp.current = true;
          }
          if (token)
            toast.show({
              message,
              action: {
                label: "Undo",
                run: async () => {
                  handoff.decided.delete(track.id);
                  await undoDecision(token);
                  router.replace(selfHref, { scroll: false });
                },
              },
            });
        },
        () => fail("Couldn't save that. Nothing changed. Try again.", `Couldn't save “${track.title}”. Nothing changed.`),
      );
    },
    [player, track, next, waiting, toast, router, selfHref, queueHref, advance],
  );
  // The swipe handler calls the latest decide() without re-binding (the player re-renders several times a second,
  // which used to reset a drag in progress).
  const decideRef = useRef(decide);
  useEffect(() => {
    decideRef.current = decide;
  }, [decide]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === "Escape") setReplying(false);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "k") decide("kept", "key");
      else if (k === "x") decide("passed", "key");
      else if (k === "r") setReplying(true);
      else if (k === "u") toast.undoLatest();
      else if ((k === "j" || e.key === "ArrowDown") && next) router.replace(next.href, { scroll: false });
      else if (e.key === "ArrowUp" && prevHref) router.replace(prevHref, { scroll: false });
      else if (e.key === "ArrowRight") player.seekBy(10);
      else if (e.key === "ArrowLeft") player.seekBy(-10);
      else if (k in JUMPS) {
        // 1–4: jump to 25 / 50 / 75 / 90% (straight to the drop). Starts the track first if it isn't playing.
        const f = JUMPS[k];
        if (player.current?.id === track.id) player.seek(f);
        else {
          player.play(track);
          setTimeout(() => player.seek(f), 250);
        }
      } else if (e.code === "Space") {
        if (e.target instanceof HTMLElement && e.target.closest("button, a, summary, [role=slider]")) return;
        if (player.current?.id === track.id) player.toggle();
        else player.play(track);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, next, prevHref, player, router, toast, track]);

  // Touch screens: drag the top card (artwork, title, waveform) right to keep, left for Not for me. It follows the
  // finger with a stamp; past the line (haptic tap in the app, the stamp lands) or on a quick flick it decides; short
  // of that it snaps back. Grabbing it mid-snap carries on from where it is on screen.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const zone = shownZone();
    if (!zone) return;
    const stamp = zone.querySelector<HTMLElement>("[data-stamp]");
    const reduce = reducedMotion();
    let x0 = 0, y0 = 0, grab = 0, dx = 0, mode: "idle" | "maybe" | "drag" | "scroll" = "idle";
    // Recent positions, for the release velocity (the speed at the end of the gesture, not its average).
    let samples: { t: number; x: number }[] = [];
    const haptic = () => {
      const cap = (window as unknown as { Capacitor?: { Plugins?: { Haptics?: { impact: (o: { style: string }) => Promise<void> } } } }).Capacitor;
      if (cap?.Plugins?.Haptics) void cap.Plugins.Haptics.impact({ style: "MEDIUM" }).catch(() => {});
      else navigator.vibrate?.(12);
    };
    const begin = (e: TouchEvent) => {
      mode = "idle";
      if (deciding.current) return;
      if (isTyping(e.target) || (e.target instanceof HTMLElement && e.target.closest("[role=slider], input, textarea, button, a, summary, select"))) return;
      // Interruptible: pick the card up where it is on screen, not where it was heading.
      const live = getComputedStyle(zone).transform;
      const at = live && live !== "none" ? new DOMMatrix(live).m41 : 0;
      zone.style.transition = "none";
      if (stamp) stamp.style.transition = "none";
      x0 = e.touches[0].clientX - at;
      y0 = e.touches[0].clientY;
      grab = at;
      dx = at;
      samples = [{ t: performance.now(), x: at }];
      mode = at ? "drag" : "maybe";
      if (at) paint(zone, at, reduce);
    };
    const move = (e: TouchEvent) => {
      if (mode !== "maybe" && mode !== "drag") return;
      const x = e.touches[0].clientX - x0;
      const y = e.touches[0].clientY - y0;
      if (mode === "maybe") {
        if (Math.abs(y) > 12 && Math.abs(y) > Math.abs(x)) return void (mode = "scroll");
        if (Math.abs(x) > 12) mode = "drag";
        else return;
      }
      e.preventDefault();
      const over = Math.abs(x) >= LINE;
      if (Math.abs(dx) >= LINE !== over) {
        // Crossing the line: the haptic, and the stamp lands at full strength (1.12 → 1).
        haptic();
        if (over && stamp && !reduce) stamp.animate([{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 140, easing: EASE_OUT });
      }
      dx = x;
      const now = performance.now();
      samples.push({ t: now, x });
      while (samples.length > 2 && now - samples[0].t > 150) samples.shift();
      paint(zone, dx, reduce);
    };
    const end = () => {
      const was = mode;
      mode = "idle";
      if (was !== "drag") return;
      // A quick flick decides too: at least 30px moved since the grab and still going over 0.11 px/ms (over the last
      // ~80ms) the same way when the finger lifts. A finger that stopped, or a tap mid snap-back, doesn't.
      const now = performance.now();
      const from = samples.find((s) => now - s.t <= 80) ?? samples[samples.length - 1];
      const v = from ? (dx - from.x) / Math.max(1, now - from.t) : 0;
      const flick = Math.abs(dx - grab) >= 30 && Math.abs(v) > 0.11 && Math.sign(v) === Math.sign(dx);
      if (Math.abs(dx) < LINE && !flick) return snapBack(zone, reduce);
      setSwiped(true);
      try {
        localStorage.setItem("ft:swiped", "1");
      } catch {}
      decideRef.current(dx > 0 ? "kept" : "passed", "touch");
    };
    zone.addEventListener("touchstart", begin, { passive: true });
    zone.addEventListener("touchmove", move, { passive: false });
    zone.addEventListener("touchend", end);
    zone.addEventListener("touchcancel", end);
    return () => {
      zone.removeEventListener("touchstart", begin);
      zone.removeEventListener("touchmove", move);
      zone.removeEventListener("touchend", end);
      zone.removeEventListener("touchcancel", end);
    };
  }, [setSwiped]);

  // One rail on every screen: Not for me stays neutral (passing is never shown as danger), Keep is the one lime fill.
  // A finger or pen tap on Keep / Not for me animates like a swipe; a mouse click or Enter / Space on a focused button doesn't.
  const btn = "btn min-h-14 min-w-0 flex-1 flex-col gap-0.5 whitespace-normal px-1.5 py-3 border";
  const buttons = (
    <div className={`flex gap-2 ${docked ? "mx-auto max-w-md" : ""}`} role="group" aria-label="Decision" aria-busy={saving || undefined}>
      <button
        onPointerDown={(e) => void (lastPointer.current = e.pointerType)}
        onClick={(e) => decide("passed", e.detail === 0 ? "key" : lastPointer.current === "mouse" ? "pointer" : "touch")}
        aria-pressed={track.decision === "passed"}
        aria-keyshortcuts="X"
        className={`${btn} ${track.decision === "passed" ? "border-bone bg-bone/10" : "border-line-2 hover:border-mute hover:bg-ink-3"}`}
      >
        <span className="whitespace-nowrap text-[13px] font-semibold md:text-base">{track.decision === "passed" ? "Not for me ✓" : "Not for me"}</span>
        <span className="max-w-full truncate text-[11px] text-mute"><span className="hidden lg:inline">X · </span>private</span>
      </button>
      <button
        onPointerDown={(e) => void (lastPointer.current = e.pointerType)}
        onClick={(e) => decide("kept", e.detail === 0 ? "key" : lastPointer.current === "mouse" ? "pointer" : "touch")}
        aria-pressed={track.decision === "kept"}
        aria-keyshortcuts="K"
        className={`${btn} flex-[1.25] border-lime bg-lime text-ink hover:bg-[#e2ff7a]`}
      >
        <span className="text-sm font-bold md:text-base">{track.decision === "kept" ? "Kept ✓" : "Keep"}</span>
        <span className="max-w-full truncate text-[11px] text-ink/70"><span className="hidden lg:inline">K · </span>adds to crate</span>
      </button>
      <button
        onClick={() => setReplying((r) => !r)}
        aria-expanded={replying}
        aria-keyshortcuts="R"
        className={`${btn} ${replying ? "border-bone" : "border-line-2 hover:border-mute hover:bg-ink-3"}`}
      >
        <span className="text-sm font-semibold md:text-base">Reply</span>
        <span className="max-w-full truncate text-[11px] text-mute"><span className="hidden lg:inline">R · </span>by email</span>
      </button>
    </div>
  );

  return (
    <div>
      {docked ? (
        // Phones: docked at the bottom, in thumb reach, on the same dark material as the tab bar it stands in for.
        <div
          data-rail-dock
          className="keep-night fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.07] bg-gradient-to-b from-[#24261f] to-[#141512] px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-bone shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_-10px_24px_-8px_rgba(0,0,0,0.6)]"
        >
          {buttons}
        </div>
      ) : (
        buttons
      )}

      <div data-leave-fade>
        {replying && (
          <form
            ref={formRef}
            className="mt-3"
            action={(fd) =>
              start(async () => {
                await onReply(fd);
                formRef.current?.reset();
                setReplying(false);
                toast.show({ message: `Reply emailed to ${senderName}` });
              })
            }
          >
            <label className="sr-only" htmlFor="reply-body">
              Reply to {senderName}
            </label>
            <QuickReplies
              senderName={senderName}
              onPick={(t) => {
                if (replyRef.current) replyRef.current.value = t;
                replyRef.current?.focus();
              }}
            />
            <textarea
              id="reply-body"
              ref={replyRef}
              name="body"
              required
              maxLength={4000}
              className="input min-h-24 resize-y"
              placeholder={`Emailed to ${senderName} from FloorTest.`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) formRef.current?.requestSubmit();
              }}
            />
            <div className="mt-2 flex items-center gap-2">
              <button className="btn-lime btn-sm" disabled={busy}>
                {busy ? "Sending…" : "Send reply"}
              </button>
              <ReplyTemplates
                onPick={(t) => {
                  if (replyRef.current) replyRef.current.value = t;
                  replyRef.current?.focus();
                }}
                current={() => replyRef.current?.value ?? ""}
              />
              <button type="button" className="btn-ghost btn-sm" onClick={() => setReplying(false)}>
                Cancel
              </button>
              <span className="ml-auto text-xs text-mute">⌘/Ctrl + Enter to send · Esc to close</span>
            </div>
          </form>
        )}

        {!swiped && <p className="mt-3 text-[11px] text-faint [@media(pointer:fine)]:hidden">Swipe right to keep · swipe left: not for me</p>}
        <details className="mt-3 hidden text-xs text-mute md:block">
          <summary className="w-fit cursor-pointer list-none rounded border border-line px-1.5 py-0.5 hover:text-bone [&::-webkit-details-marker]:hidden">? Shortcuts</summary>
          <p className="mt-2">
            {next ? "Keep or Not for me moves to the next track." : "Last track in this view."} K keep · X not for me · R reply · Space play · 1–4 jump to 25/50/75/90% ·
            ←/→ 10s · ↑/↓ or J move · U undo
          </p>
        </details>
      </div>
    </div>
  );
}
