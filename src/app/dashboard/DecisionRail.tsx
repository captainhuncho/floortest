"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { isTyping, usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { QuickReplies } from "./QuickReplies";
import { ReplyTemplates } from "./ReplyTemplates";
import { decideTrack, undoDecision } from "./actions/review";
import { stored, useDeviceState } from "@/components/useBrowserValue";

/** Number keys jump through the track: 1 = a quarter in, 4 = near the end. */
const JUMPS: Record<string, number> = { "1": 0.25, "2": 0.5, "3": 0.75, "4": 0.9 };

type Props = {
  track: PlayerTrack & { decision: "kept" | "passed" | null };
  senderName: string;
  selfHref: string;
  next: { href: string; track: PlayerTrack } | null;
  prevHref: string | null;
  onReply: (fd: FormData) => Promise<void>;
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

  const advance = useCallback(
    (wasPlaying: boolean) => {
      if (!next) return;
      router.replace(next.href, { scroll: false });
      if (wasPlaying) player.play(next.track);
    },
    [next, router, player],
  );

  const decide = useCallback(
    (d: "kept" | "passed") => {
      if (busy) return;
      const wasPlaying = player.current?.id === track.id && player.playing;
      start(async () => {
        const token = track.decision === d ? null : await decideTrack(track.id, d);
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
        advance(wasPlaying);
      });
    },
    [busy, player, track, toast, router, selfHref, advance],
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

  // One rail on every screen: Not for me stays neutral (passing is never shown as danger), Keep is the one lime fill.
  const btn = "btn min-h-14 min-w-0 flex-1 flex-col gap-0.5 whitespace-normal px-1.5 py-3 border";
  return (
    <div>
      {/* Phones: the download sits above the rail. */}
      <div className="mb-3 md:hidden">
        <a href={`/api/tracks/${track.id}/download`} className="rounded-full border border-line bg-ink-3 px-3.5 py-2 text-[11px] font-medium text-mute">
          Download
        </a>
      </div>
      <div className="flex gap-2" role="group" aria-label="Decision">
        <button
          onClick={() => decide("passed")}
          disabled={busy}
          aria-pressed={track.decision === "passed"}
          aria-keyshortcuts="X"
          className={`${btn} ${track.decision === "passed" ? "border-bone bg-bone/10" : "border-line-2 hover:border-mute hover:bg-ink-3"}`}
        >
          <span className="whitespace-nowrap text-[13px] font-semibold md:text-base">{track.decision === "passed" ? "Not for me ✓" : "Not for me"}</span>
          <span className="max-w-full truncate text-[11px] text-mute"><span className="hidden lg:inline">X · </span>private</span>
        </button>
        <button
          onClick={() => decide("kept")}
          disabled={busy}
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
  );
}
