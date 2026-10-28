"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { isTyping, usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import type { ReplyResult } from "./actions/review";
import { QuickReplies } from "./QuickReplies";
import { ReplyTemplates } from "./ReplyTemplates";
import { decideTrack, undoDecision } from "./actions/review";
import { stored, useDeviceState } from "@/components/useBrowserValue";
import { useQueue } from "./review/QueueState";

/** Number keys jump through the track: 1 = a quarter in, 4 = near the end. */
const JUMPS: Record<string, number> = { "1": 0.25, "2": 0.5, "3": 0.75, "4": 0.9 };

type Props = {
  track: PlayerTrack & { decision: "kept" | "passed" | null };
  senderName: string;
  selfHref: string;
  next: { href: string; track: PlayerTrack } | null;
  prevHref: string | null;
  onReply: (fd: FormData) => Promise<ReplyResult>;
};

export function DecisionRail({ track, senderName, selfHref, next, prevHref, onReply }: Props) {
  const router = useRouter();
  const player = usePlayer();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [replying, setReplying] = useState(false);
  // The swipe hint shows until the first swipe on this device.
  const [swiped, setSwiped] = useDeviceState(() => stored("ft:swiped") === "1", true);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Close the composer when moving to another track.
  const [replyFor, setReplyFor] = useState(track.id);
  if (replyFor !== track.id) {
    setReplyFor(track.id);
    setReplying(false);
  }
  useEffect(() => {
    if (replying) replyRef.current?.focus();
  }, [replying]);

  const queue = useQueue();

  // Moving on shows the next track at once from what the list knows (QueueState); the server's page follows.
  const goNext = useCallback(() => {
    if (!next) return;
    queue?.show(next.track);
    router.replace(next.href, { scroll: false });
  }, [next, queue, router]);

  const decide = useCallback(
    (d: "kept" | "passed") => {
      if (busy) return;
      const wasPlaying = player.current?.id === track.id && player.playing;
      const changes = track.decision !== d;
      // The screen moves on before the server answers: the decided track leaves the list and the next one is up.
      if (changes) queue?.leave(track.id, d);
      if (next) {
        queue?.show(next.track);
        if (wasPlaying) player.play(next.track);
      }
      start(async () => {
        let token: Awaited<ReturnType<typeof decideTrack>> = null;
        try {
          token = changes ? await decideTrack(track.id, d) : null;
        } catch {
          // Not saved (connection dropped): say so and put this track back on screen.
          toast.show({ message: `Couldn't save that for “${track.title}”. Try again.` });
          router.replace(selfHref, { scroll: false });
          return;
        }
        if (token) {
          toast.show({
            message: `${d === "kept" ? `“${track.title}” added to Prepare for set` : `Not for me: “${track.title}”`}`,
            action: {
              label: "Undo",
              run: async () => {
                await undoDecision(token);
                router.replace(selfHref, { scroll: false });
              },
            },
          });
        }
        if (next) router.replace(next.href, { scroll: false });
      });
    },
    [busy, player, track, toast, router, selfHref, next, queue],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === "Escape") setReplying(false);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "k") decide("kept");
      else if (k === "x") decide("passed");
      else if (k === "r") setReplying(true);
      else if (k === "u") toast.undoLatest();
      else if ((k === "j" || e.key === "ArrowDown") && next) goNext();
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
  }, [decide, goNext, next, prevHref, player, router, toast, track]);

  // Phones: drag the review panel right to keep, left for Not for me. The panel follows the finger with a stamp;
  // let go past the line to decide (with a haptic tap in the app), or short of it to snap back.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const zone = document.querySelector<HTMLElement>("[data-swipe-zone]");
    if (!zone) return;
    const LINE = 90;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let x0 = 0, y0 = 0, dx = 0, mode: "idle" | "maybe" | "drag" | "scroll" = "idle";
    const haptic = () => {
      const cap = (window as unknown as { Capacitor?: { Plugins?: { Haptics?: { impact: (o: { style: string }) => Promise<void> } } } }).Capacitor;
      if (cap?.Plugins?.Haptics) void cap.Plugins.Haptics.impact({ style: "MEDIUM" }).catch(() => {});
      else navigator.vibrate?.(12);
    };
    const paint = (x: number) => {
      zone.style.transform = x ? `translateX(${x}px) rotate(${x / 40}deg)` : "";
      zone.dataset.swipe = x > LINE / 3 ? "keep" : x < -LINE / 3 ? "pass" : "";
      zone.style.setProperty("--swipe-strength", String(Math.min(1, Math.abs(x) / LINE)));
    };
    const start = (e: TouchEvent) => {
      if (isTyping(e.target) || (e.target instanceof HTMLElement && e.target.closest("[role=slider], input, textarea, button, a, summary, select"))) return void (mode = "idle");
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      dx = 0;
      mode = "maybe";
      zone.style.transition = "none";
    };
    const move = (e: TouchEvent) => {
      if (mode === "idle" || mode === "scroll") return;
      const x = e.touches[0].clientX - x0;
      const y = e.touches[0].clientY - y0;
      if (mode === "maybe") {
        if (Math.abs(y) > 12 && Math.abs(y) > Math.abs(x)) return void (mode = "scroll");
        if (Math.abs(x) > 12) mode = "drag";
        else return;
      }
      e.preventDefault();
      if ((Math.abs(dx) < LINE) !== (Math.abs(x) < LINE)) haptic(); // crossing the line
      dx = x;
      paint(dx);
    };
    const end = () => {
      if (mode !== "drag") return void (mode = "idle");
      mode = "idle";
      zone.style.transition = reduce ? "none" : "transform .22s cubic-bezier(.2,.8,.2,1)";
      if (Math.abs(dx) < LINE) return paint(0);
      const keep = dx > 0;
      paint(keep ? window.innerWidth : -window.innerWidth);
      setTimeout(() => {
        zone.style.transition = "none";
        paint(0);
        setSwiped(true);
        try {
          localStorage.setItem("ft:swiped", "1");
        } catch {}
        decide(keep ? "kept" : "passed");
      }, reduce ? 0 : 200);
    };
    zone.addEventListener("touchstart", start, { passive: true });
    zone.addEventListener("touchmove", move, { passive: false });
    zone.addEventListener("touchend", end);
    zone.addEventListener("touchcancel", end);
    return () => {
      zone.removeEventListener("touchstart", start);
      zone.removeEventListener("touchmove", move);
      zone.removeEventListener("touchend", end);
      zone.removeEventListener("touchcancel", end);
      paint(0);
    };
  }, [decide, setSwiped]);

  const btn = "btn h-12 gap-2 border text-[15px] font-bold";
  const key = "font-mono text-[11px] font-medium opacity-60";
  return (
    <div>
      {/* Phones: Figma "Decisions" pills + "DJ Decision Area" */}
      {/* Phones, rule 15 Queue (28 Oct): the same three buttons as wide screens, Keep in lime; Download sits in Details. */}
      <div className="md:hidden">
        <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-2" role="group" aria-label="Decision">
          <button
            onClick={() => decide("passed")}
            disabled={busy}
            aria-pressed={track.decision === "passed"}
            className={`${btn} px-2 text-sm ${track.decision === "passed" ? "border-bone bg-bone/10" : "border-line"}`}
          >
            Not for me
          </button>
          <button
            onClick={() => decide("kept")}
            disabled={busy}
            aria-pressed={track.decision === "kept"}
            className={`${btn} border-lime bg-lime text-ink`}
          >
            {track.decision === "kept" ? "Kept ✓" : "Keep"}
          </button>
          <button onClick={() => setReplying((r) => !r)} aria-expanded={replying} className={`${btn} px-2 text-sm ${replying ? "border-bone" : "border-line"}`}>
            Reply
          </button>
        </div>
      </div>

      {/* Rule 15 Queue (28 Oct): Keep is the page's one lime button; the shortcut sits beside each word. */}
      <div className="hidden grid-cols-[1fr_1.3fr_1fr] gap-2.5 md:grid" role="group" aria-label="Decision">
        <button
          onClick={() => decide("passed")}
          disabled={busy}
          aria-pressed={track.decision === "passed"}
          aria-keyshortcuts="X"
          className={`${btn} ${track.decision === "passed" ? "border-bone bg-bone/10" : "border-line hover:border-mute hover:bg-ink-3"}`}
        >
          Not for me <kbd className={key}>X</kbd>
        </button>
        <button
          onClick={() => decide("kept")}
          disabled={busy}
          aria-pressed={track.decision === "kept"}
          aria-keyshortcuts="K"
          className={`${btn} border-lime bg-lime text-ink hover:bg-[#e2ff7a]`}
        >
          {track.decision === "kept" ? "Kept ✓" : "Keep"} <kbd className={key}>K</kbd>
        </button>
        <button
          onClick={() => setReplying((r) => !r)}
          aria-expanded={replying}
          aria-keyshortcuts="R"
          className={`${btn} ${replying ? "border-bone" : "border-line hover:border-mute hover:bg-ink-3"}`}
        >
          Reply <kbd className={key}>R</kbd>
        </button>
      </div>

      {replying && (
        <form
          ref={formRef}
          className="mt-3"
          // A plain submit, not a form action: React clears a form after its action, and a refused reply keeps its text.
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              // Says what really happened; a refused reply (a limit) keeps its text so nothing typed is lost.
              const r = await onReply(fd);
              toast.show({ message: r.message });
              if (r.status === "refused") return;
              formRef.current?.reset();
              setReplying(false);
            });
          }}
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
      {/* One faint line (rule 15 Queue, lighter panel); the full list opens from it. */}
      <details className="mt-2 hidden text-xs text-faint md:block">
        <summary className="inline-flex min-h-8 w-fit cursor-pointer list-none items-center hover:text-mute [&::-webkit-details-marker]:hidden">
          Space play · K keep · X not for me · R reply · more shortcuts
        </summary>
        <p className="mt-1 text-mute">
          {next ? "Keep or Not for me moves to the next track." : "Last track in this view."} K keep · X not for me · R reply · Space play · 1–4 jump to 25/50/75/90% ·
          ←/→ 10s · ↑/↓ or J move · U undo
        </p>
      </details>
    </div>
  );
}
