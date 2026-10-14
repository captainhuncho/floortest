"use client";

import { decisionLabel } from "@/lib/statuses";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePlayer } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { trackColumns, TrackRow } from "@/components/TrackRow";
import { isCharacterKey, shortcutsOn, shortcutTarget, useShortcutsOn } from "@/components/useShortcuts";
import { ShortcutsSettingsLink } from "@/components/ShortcutsSettingsLink";
import { Waveform } from "@/components/Waveform";
import type { Decision } from "@/lib/db";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import { clearDecision, decideTrack, replyToSender, undoDecision } from "../actions/review";
import { QuickReplies } from "../QuickReplies";
import { ReplyTemplates } from "../ReplyTemplates";
import { BatchBar } from "./BatchBar";
import { BATCH_MAX } from "@/lib/batch";

export type ListRow = {
  id: number;
  title: string;
  artist: string;
  sender: string;
  senderId: number;
  senderEmail: string;
  senderVerified: boolean;
  genre: string | null;
  bpm: number | null;
  /** "Unreleased", "Signed", "Released": shown in the reply panel's file line. */
  releaseLabel: string | null;
  mixLabel: string | null;
  duplicateOf: number | null;
  message: string;
  duration: number | null;
  peaks: number[] | null;
  decision: Decision | null;
  played: boolean;
  downloaded: boolean;
  replied: boolean;
  createdAt: number;
};

const JUMPS: Record<string, number> = { "1": 0.25, "2": 0.5, "3": 0.75, "4": 0.9 };

/**
 * The List view (and a collection's tracks) as shared TrackRows: title over `artist · genre`, readouts, the status in
 * words, then Keep / Not for me / Reply / Download. `statusTag` also names waiting tracks "Needs review" (a collection
 * mixes every status); in the Queue a waiting track has only the dot before its title.
 */
export function ListRows({ rows, statusTag = false, collections = [] }: { rows: ListRow[]; statusTag?: boolean; collections?: { id: number; name: string }[] }) {
  const player = usePlayer();
  const toast = useToast();
  const [keysOn] = useShortcutsOn();
  const [selected, setSelected] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision | null>>({});
  const [, start] = useTransition();
  const queue = rows.map(toPlayer);
  const listRef = useRef<HTMLUListElement>(null);
  // Select mode: tick tracks, then act on them all at once from the batch bar.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < BATCH_MAX) n.add(id);
      return n;
    });
  const allPicked = rows.length > 0 && rows.slice(0, BATCH_MAX).every((r) => picked.has(r.id));
  const stopPicking = () => (setPicking(false), setPicked(new Set()));

  // Server data wins once it arrives.
  const [rowsSeen, setRowsSeen] = useState(rows);
  if (rowsSeen !== rows) {
    setRowsSeen(rows);
    setDecisions({});
  }

  const decisionOf = (r: ListRow) => (r.id in decisions ? decisions[r.id] : r.decision);

  const select = useCallback((id: number | null) => {
    setSelected(id);
    if (id) listRef.current?.querySelector<HTMLElement>(`[data-row="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }, []);

  const decide = useCallback(
    (r: ListRow, d: Decision, advance: boolean) => {
      const current = r.id in decisions ? decisions[r.id] : r.decision;
      // Pressing the active decision again clears it (back to Needs review).
      const next = current === d ? null : d;
      const wasPlaying = player.current?.id === r.id && player.playing;
      setDecisions((m) => ({ ...m, [r.id]: next }));
      start(async () => {
        if (next === null) {
          await clearDecision(r.id);
          toast.show({ message: `“${r.title}” is back in Needs review` });
          return;
        }
        const token = await decideTrack(r.id, next);
        if (token)
          toast.show({
            message: `${next === "kept" ? `“${r.title}” added to Prepare` : `Not for me: “${r.title}”`}`,
            action: {
              label: "Undo",
              run: async () => {
                setDecisions((m) => ({ ...m, [r.id]: token.prev.decision }));
                await undoDecision(token);
              },
            },
          });
      });
      if (advance) {
        const i = rows.findIndex((x) => x.id === r.id);
        const nextRow = rows[i + 1];
        if (nextRow) {
          select(nextRow.id);
          if (wasPlaying) player.play(toPlayer(nextRow), queue);
        }
      }
    },
    [decisions, player, rows, queue, select, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picking) {
        if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) {
          setPicking(false);
          setPicked(new Set());
        }
        return;
      }
      // Focus on the page or in the list, nothing floating open; letters and digits only while switched on.
      if (!shortcutTarget(e) || (!shortcutsOn() && isCharacterKey(e))) return;
      const i = rows.findIndex((r) => r.id === selected);
      const r = rows[i];
      const k = e.key.toLowerCase();
      if (e.key === "ArrowDown" || k === "j") select(rows[Math.min(rows.length - 1, i + 1)]?.id ?? rows[0].id);
      else if (e.key === "ArrowUp") select(rows[Math.max(0, i - 1)]?.id ?? rows[0].id);
      else if (k === "u") toast.undoLatest();
      else if (!r) return;
      else if (e.code === "Space") {
        if (e.target instanceof HTMLElement && e.target.closest("button, a, [role=slider]")) return;
        player.play(toPlayer(r), queue);
      } else if (k === "k") decide(r, "kept", true);
      else if (k === "x") decide(r, "passed", true);
      else if (k === "r" || e.key === "Enter") {
        // Enter on a focused button or link is that control's own click.
        if (e.key === "Enter" && e.target instanceof HTMLElement && e.target.closest("button, a")) return;
        setExpanded((x) => (x === r.id && e.key === "Enter" ? null : r.id));
      } else if (k in JUMPS) {
        // 1–4: jump to 25 / 50 / 75 / 90% of the selected track (starts it if needed).
        if (player.current?.id === r.id) player.seek(JUMPS[k]);
        else {
          player.play(toPlayer(r), queue);
          setTimeout(() => player.seek(JUMPS[k]), 250);
        }
      } else if (e.key === "ArrowRight") player.seekBy(10);
      else if (e.key === "ArrowLeft") player.seekBy(-10);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, select, decide, player, queue, toast, picking]);

  return (
    <div data-shortcuts>
      <div className="mb-2 flex items-center justify-end gap-2">
        {picking ? (
          <>
            <label className="mr-auto flex items-center gap-2 text-xs text-mute">
              <input
                type="checkbox"
                className="size-4 accent-lime"
                aria-label="Select all tracks"
                checked={allPicked}
                onChange={() => setPicked(allPicked ? new Set() : new Set(rows.slice(0, BATCH_MAX).map((r) => r.id)))}
              />
              Select all{rows.length > BATCH_MAX ? ` (first ${BATCH_MAX})` : ` (${rows.length})`}
            </label>
            <button type="button" className="btn btn-sm btn-ghost" onClick={stopPicking}>
              Done
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPicking(true)}>
            Select
          </button>
        )}
      </div>
      <ul ref={listRef} className="space-y-2" aria-label="Queue">
        {rows.map((r) => {
          const isCurrent = player.current?.id === r.id;
          const playing = isCurrent && player.playing;
          const d = player.duration || r.duration || 0;
          const decision = decisionOf(r);
          const open = expanded === r.id;
          const isPicked = picked.has(r.id);
          const signal = r.downloaded ? "Downloaded" : r.played ? "Listened" : "";
          return (
            <li
              key={r.id}
              data-row={r.id}
              aria-current={selected === r.id ? "true" : undefined}
              onClick={() => (picking ? toggle(r.id) : setSelected(r.id))}
              className={picking ? "flex items-center gap-2" : undefined}
            >
              {picking && (
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-lime"
                  checked={isPicked}
                  onChange={() => toggle(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${r.artist} - ${r.title}`}
                />
              )}
              <div className={picking ? `relative min-w-0 flex-1 rounded-card ${isPicked ? "ring-2 ring-lime/60" : ""}` : undefined}>
                {/* Select mode: the whole row ticks the track, so a stray tap never plays, keeps or opens it. */}
                {picking && (
                  <button type="button" tabIndex={-1} aria-hidden className="absolute inset-0 z-10 cursor-pointer rounded-card" onClick={(e) => (e.stopPropagation(), toggle(r.id))} />
                )}
                <TrackRow
                  as="div"
                  fit="container"
                  title={r.title}
                  artist={r.artist}
                  genre={r.genre}
                  sub={[r.artist, r.genre, r.sender !== r.artist ? `via ${r.sender}` : null].filter(Boolean).join(" · ")}
                  waiting={!decision && !statusTag}
                  selected={selected === r.id}
                  onPlay={() => (setSelected(r.id), player.play(toPlayer(r), queue))}
                  playing={playing}
                  onOpen={() => (setSelected(r.id), setExpanded((x) => (x === r.id ? null : r.id)))}
                  open={open}
                  waveform={
                    <div onClick={(e) => e.stopPropagation()}>
                      <Waveform
                        peaks={r.peaks}
                        height={28}
                        progress={isCurrent && d ? player.time / d : 0}
                        onSeek={isCurrent ? player.seek : (f) => (player.play(toPlayer(r), queue), setTimeout(() => player.seek(f), 250))}
                        label={`Seek ${r.title}`}
                        dim={!!decision && !isCurrent}
                      />
                    </div>
                  }
                  status={[decision ? decisionLabel(decision) : statusTag ? "Needs review" : null, r.duplicateOf ? "Possible duplicate" : null]}
                  columns={trackColumns(r, { bpm: "lg", length: "sm" })}
                  stackActions
                  actions={
                    <>
                      {/* A signal, not a control: plain text. */}
                      <span className="w-20 shrink-0 text-[11px] text-faint">{signal}</span>
                      <DecisionButton kind="kept" title={r.title} keys={keysOn} pressed={decision === "kept"} onClick={() => decide(r, "kept", false)} />
                      <DecisionButton kind="passed" title={r.title} keys={keysOn} pressed={decision === "passed"} onClick={() => decide(r, "passed", false)} />
                      <span className="flex items-center">
                        <ActionButton
                          label={`Reply to ${r.sender}`}
                          tip="Reply"
                          hint={keysOn ? "R" : null}
                          pressed={open}
                          onClick={() => (setSelected(r.id), setExpanded(open ? null : r.id))}
                        >
                          <Icon.Bubble dot={r.replied} />
                        </ActionButton>
                        <a
                          href={`/api/tracks/${r.id}/download`}
                          title="Download original"
                          aria-label={`Download original of ${r.title}`}
                          className="grid size-11 place-items-center rounded-md text-mute transition hover:bg-ink-3 hover:text-bone"
                        >
                          <Icon.Download />
                        </a>
                      </span>
                    </>
                  }
                >
                  {open && !picking && <Expanded row={r} decision={decision} onClose={() => setExpanded(null)} />}
                </TrackRow>
              </div>
            </li>
          );
        })}
      </ul>
      {picking && picked.size > 0 && (
        <BatchBar
          ids={[...picked]}
          collections={collections}
          onDone={stopPicking}
          onDecide={(d) => setDecisions((m) => ({ ...m, ...Object.fromEntries([...picked].map((id) => [id, d])) }))}
        />
      )}
      <div className="mt-4 hidden items-center justify-between gap-4 card px-4 py-3 text-[11px] text-faint md:flex">
        <div className="min-w-0">
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {(keysOn
              ? [
                  ["↑/↓", "select"],
                  ["Space", "play"],
                  ["K", "keep"],
                  ["X", "not for me"],
                  ["R", "reply"],
                  ["Enter", "details"],
                  ["1–4", "jump"],
                  ["←/→", "10s"],
                  ["U", "undo"],
                ]
              : [
                  ["↑/↓", "select"],
                  ["Space", "play"],
                  ["Enter", "details"],
                  ["←/→", "10s"],
                ]
            ).map(([k, v]) => (
              <span key={k}>
                <span className="font-bold text-bone">{k}</span> {v}
              </span>
            ))}
          </p>
          <p className="mt-1">
            <ShortcutsSettingsLink on={keysOn} />
          </p>
        </div>
        <span className="shrink-0 text-mute">{fmtCount(rows.length)}</span>
      </div>
    </div>
  );
}

const fmtCount = (n: number) => `${n} track${n === 1 ? "" : "s"}`;

/** The reply panel under an open row: the sender's message and who they are on the left, the reply on the right. */
function Expanded({ row: r, decision, onClose }: { row: ListRow; decision: Decision | null; onClose: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);

  return (
    <div className="grid gap-5 border-t border-line pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-3 text-sm">
        {r.message ? (
          <figure className="rounded-lg border border-line bg-ink-2 p-3">
            <figcaption className="label mb-1">Message from {r.sender}</figcaption>
            <blockquote className="whitespace-pre-wrap text-[15px] text-bone">{r.message}</blockquote>
          </figure>
        ) : (
          <p className="text-mute">No message with this track.</p>
        )}
        <p className="text-mute">
          <Link href={`/dashboard/contacts/${r.senderId}`} className="text-bone underline-offset-4 hover:underline">
            {r.sender}
          </Link>{" "}
          · {r.senderEmail}{" "}
          <span className={`chip ${r.senderVerified ? "border-line text-bone" : "border-line text-mute"}`}>
            {r.senderVerified ? "Verified" : "Unverified"}
          </span>
        </p>
        <p className="text-mute">
          {[fmtTime(r.duration), r.releaseLabel, r.mixLabel, decisionLabel(decision), r.played ? "Listened" : "Not listened", r.downloaded ? "Downloaded" : "Not downloaded"]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <Link href={`/dashboard/review?view=queue&s=all&t=${r.id}`} className="inline-block underline underline-offset-4 hover:text-lime">
          Open full review →
        </Link>
      </div>
      <form
        ref={form}
        action={(fd) =>
          start(async () => {
            await replyToSender(r.senderId, r.id, fd);
            form.current?.reset();
            toast.show({ message: `Reply emailed to ${r.sender}` });
            onClose();
          })
        }
      >
        <label htmlFor={`reply-${r.id}`} className="label mb-1.5 block">
          Reply to {r.sender}
        </label>
        <QuickReplies
          senderName={r.sender}
          onPick={(t) => {
            if (area.current) area.current.value = t;
            area.current?.focus();
          }}
        />
        <textarea
          id={`reply-${r.id}`}
          ref={area}
          name="body"
          required
          maxLength={4000}
          className="input min-h-24 resize-y"
          placeholder="Sent by email"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.current?.requestSubmit();
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-lime btn-sm" disabled={pending}>
            {pending ? "Sending…" : "Send reply"}
          </button>
          <ReplyTemplates
            onPick={(t) => {
              if (area.current) area.current.value = t;
              area.current?.focus();
            }}
            current={() => area.current?.value ?? ""}
          />
          <button type="button" className="btn btn-sm text-mute" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </div>
  );
}

function ActionButton({
  label,
  tip,
  hint,
  pressed,
  onClick,
  children,
}: {
  label: string;
  tip: string;
  /** The shortcut key, or null while shortcuts are off. */
  hint: string | null;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={hint ?? undefined}
      title={hint ? `${tip} (${hint})` : tip}
      className={`grid size-11 place-items-center rounded-md transition hover:bg-ink-3 ${pressed ? "text-bone" : "text-mute hover:text-bone"}`}
    >
      {children}
    </button>
  );
}

/**
 * Keep and Not for me in a row, worded as on the decision rail. Both neutral until chosen: Keep fills lime once kept
 * (the one light), Not for me never turns red. 44px tall.
 */
function DecisionButton({ kind, title, keys, pressed, onClick }: { kind: "kept" | "passed"; title: string; keys: boolean; pressed: boolean; onClick: () => void }) {
  const keep = kind === "kept";
  const key = keep ? "K" : "X";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={keep ? `Keep ${title}` : `Not for me: ${title}`}
      aria-pressed={pressed}
      aria-keyshortcuts={keys ? key : undefined}
      title={`${keep ? "Keep" : "Not for me"}${keys ? ` (${key})` : ""}`}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2.5 text-[12px] font-semibold transition ${
        keep
          ? pressed
            ? "border-lime bg-lime text-ink"
            : "border-line text-bone hover:border-lime hover:bg-lime hover:text-ink"
          : pressed
            ? "border-bone bg-bone/10 text-bone"
            : "border-line text-mute hover:border-mute hover:text-bone"
      }`}
    >
      {keep ? (pressed ? "Kept" : "Keep") : "Not for me"}
    </button>
  );
}

const svg = "h-[22px] w-[22px]";
const Icon = {
  Bubble: ({ dot }: { dot: boolean }) => (
    <svg viewBox="0 0 24 24" className={svg} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden strokeLinejoin="round">
      <path d="M12 4c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-1 0-2-.1-2.9-.4L4.5 20l1.2-3.8a6.8 6.8 0 0 1-2.2-5C3.5 7.2 7.3 4 12 4Z" />
      {dot && <circle cx="18.5" cy="5.5" r="3" fill="var(--color-lime)" stroke="none" />}
    </svg>
  ),
  Download: () => (
    <svg viewBox="0 0 24 24" className={svg} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4.5 16.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </svg>
  ),
};
