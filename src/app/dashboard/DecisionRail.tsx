"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { isTyping, usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { QuickReplies } from "./QuickReplies";
import { ReplyTemplates } from "./ReplyTemplates";
import { decideTrack, undoDecision } from "./actions/review";

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
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Close the composer when moving to another track.
  useEffect(() => setReplying(false), [track.id]);
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
      else if (e.code === "Space") {
        if (e.target instanceof HTMLElement && e.target.closest("button, a, [role=slider]")) return;
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
      if (isTyping(e.target) || (e.target instanceof HTMLElement && e.target.closest("[role=slider], input, textarea, button, a"))) return void (mode = "idle");
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
  }, [decide]);

  const btn = "btn flex-1 flex-col gap-0.5 py-3 border";
  const pill = "rounded-full border border-line bg-ink-3 px-3.5 py-2 text-[11px] font-medium text-mute";
  return (
    <div>
      {/* Phones: Figma "Decisions" pills + "DJ Decision Area" */}
      <div className="md:hidden">
        <div className="flex flex-wrap gap-[5px]">
          <a href={`/api/tracks/${track.id}/download`} className={pill}>
            DOWNLOAD
          </a>
          <button onClick={() => setReplying((r) => !r)} aria-expanded={replying} className={replying ? "rounded-full bg-white px-3.5 py-2 text-[11px] font-bold text-ink" : pill}>
            REPLY
          </button>
        </div>
        <div className="flex gap-2 pt-3" role="group" aria-label="Decision">
          <button
            onClick={() => decide("passed")}
            disabled={busy}
            aria-pressed={track.decision === "passed"}
            className={`flex-1 rounded-xl border border-[#ff5f57] p-3.5 text-[11px] font-bold ${track.decision === "passed" ? "bg-[#ff5f57] text-ink" : "bg-[rgba(255,95,87,0.1)] text-[#ff5f57]"}`}
          >
            ✕ NOT FOR ME
          </button>
          <button
            onClick={() => decide("kept")}
            disabled={busy}
            aria-pressed={track.decision === "kept"}
            className={`flex-1 rounded-xl p-3.5 text-[11px] font-bold ${track.decision === "kept" ? "bg-lime text-ink" : "bg-white text-ink"}`}
          >
            {track.decision === "kept" ? "✓ KEPT" : "✓ KEEP"}
          </button>
        </div>
      </div>

      <div className="hidden gap-2 md:flex" role="group" aria-label="Decision">
        <button
          onClick={() => decide("passed")}
          disabled={busy}
          aria-pressed={track.decision === "passed"}
          aria-keyshortcuts="X"
          className={`${btn} ${track.decision === "passed" ? "border-bone bg-bone/10" : "border-line hover:border-mute hover:bg-ink-3"}`}
        >
          <span className="text-base font-semibold">Not for me</span>
          <span className="hidden text-xs text-mute md:inline">X</span>
        </button>
        <button
          onClick={() => decide("kept")}
          disabled={busy}
          aria-pressed={track.decision === "kept"}
          aria-keyshortcuts="K"
          className={`${btn} ${track.decision === "kept" ? "border-lime bg-lime text-ink" : "border-lime/60 text-lime hover:bg-lime hover:text-ink"}`}
        >
          <span className="text-base font-semibold">{track.decision === "kept" ? "Kept ✓" : "Keep"}</span>
          <span className={`text-xs ${track.decision === "kept" ? "text-ink/70" : "opacity-70"}`}><span className="hidden md:inline">K · </span>adds to crate</span>
        </button>
        <button
          onClick={() => setReplying((r) => !r)}
          aria-expanded={replying}
          aria-keyshortcuts="R"
          className={`${btn} ${replying ? "border-bone" : "border-line hover:border-mute hover:bg-ink-3"}`}
        >
          <span className="text-base font-semibold">Reply</span>
          <span className="hidden text-xs text-mute md:inline">R</span>
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

      <p className="mt-3 text-[11px] text-faint [@media(pointer:fine)]:hidden">Swipe right to keep · swipe left: not for me</p>
      <p className="mt-3 hidden text-xs text-mute md:block">
        {next ? "Keep or Not for me moves to the next track." : "Last track in this view."} Space play · ←/→ 10s · ↑/↓ or J move · U undo
      </p>
    </div>
  );
}
