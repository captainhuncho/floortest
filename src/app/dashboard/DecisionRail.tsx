"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { isTyping, usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { decideTrack, undoDecision } from "./actions";

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
            message: `${d === "kept" ? "Kept" : "Could be better:"} “${track.title}”`,
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

  const btn = "btn flex-1 flex-col gap-0.5 py-3 border";
  return (
    <div>
      <div className="flex gap-2" role="group" aria-label="Decision">
        <button
          onClick={() => decide("passed")}
          disabled={busy}
          aria-pressed={track.decision === "passed"}
          aria-keyshortcuts="X"
          className={`${btn} ${track.decision === "passed" ? "border-bone bg-bone/10" : "border-line hover:border-mute hover:bg-ink-3"}`}
        >
          <span className="text-base font-semibold">Could be better</span>
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
            <button type="button" className="btn-ghost btn-sm" onClick={() => setReplying(false)}>
              Cancel
            </button>
            <span className="ml-auto text-xs text-mute">⌘/Ctrl + Enter to send · Esc to close</span>
          </div>
        </form>
      )}

      <p className="mt-3 hidden text-xs text-mute md:block">
        {next ? "Keep or Could be better moves to the next track." : "Last track in this view."} Space play · ←/→ 10s · ↑/↓ or J move · U undo
      </p>
    </div>
  );
}
