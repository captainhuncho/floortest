"use client";

import { decisionLabel } from "@/lib/statuses";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { isTyping, PlayIcon, usePlayer } from "@/components/Player";
import { useToast } from "@/components/Toast";
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
  meta: string[];
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

/** "2mo", "3d", "5h": the reference's compact age column. */
function age(ts: number) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo}mo` : `${Math.round(mo / 12)}y`;
}


/** `statusTag` swaps the age for a Needs review / Kept / Not for me tag (Figma collection detail). */
export function ListRows({ rows, statusTag = false, collections = [] }: { rows: ListRow[]; statusTag?: boolean; collections?: { id: number; name: string }[] }) {
  const player = usePlayer();
  const toast = useToast();
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
            message: `${next === "kept" ? `“${r.title}” added to Prepare for set` : `Not for me: “${r.title}”`}`,
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
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (picking) {
        if (e.key === "Escape") {
          setPicking(false);
          setPicked(new Set());
        }
        return;
      }
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
      else if (k === "r" || e.key === "Enter") setExpanded((x) => (x === r.id && e.key === "Enter" ? null : r.id));
      else if (k in JUMPS) {
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
    <>
      <div className="mb-2 flex items-center justify-end gap-2 px-3 md:px-0">
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
      <ul ref={listRef} className="@container space-y-2.5 px-3 md:space-y-2 md:px-0" aria-label="Review Queue">
        {rows.map((r) => {
          const isCurrent = player.current?.id === r.id;
          const playing = isCurrent && player.playing;
          const d = player.duration || r.duration || 0;
          const decision = decisionOf(r);
          const open = expanded === r.id;
          // Waiting for a decision stands out (lime edge, bright title); decided tracks step back with their outcome shown.
          const waiting = !decision;
          const outcome = decision ? decisionLabel(decision) : null;
          return (
            <li
              key={r.id}
              data-row={r.id}
              aria-current={selected === r.id ? "true" : undefined}
              onClick={() => (picking ? toggle(r.id) : setSelected(r.id))}
              className={`group transition ${picking ? "flex items-center gap-2" : ""}`}
            >
              {picking && (
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-lime"
                  checked={picked.has(r.id)}
                  onChange={() => toggle(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${r.artist} - ${r.title}`}
                />
              )}
              <div className={picking ? `relative min-w-0 flex-1 rounded-panel ${picked.has(r.id) ? "ring-2 ring-lime/60" : ""}` : "contents"}>
              {/* Select mode: the whole row ticks the track, so a stray tap never plays, keeps or opens it. */}
              {picking && <button type="button" tabIndex={-1} aria-hidden className="absolute inset-0 z-10 cursor-pointer rounded-panel" onClick={(e) => (e.stopPropagation(), toggle(r.id))} />}
              {/* Phones: Figma "track-card" */}
              <div
                className={`flex flex-col gap-2.5 rounded-panel border p-3 md:hidden ${
                  waiting ? "border-line border-l-2 border-l-bone bg-ink-3" : "border-line bg-ink-2"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(r.id);
                      player.play(toPlayer(r), queue);
                    }}
                    className={`grid size-11 shrink-0 place-items-center rounded-lg border text-bone ${isCurrent ? "border-bone" : "border-line"}`}
                    aria-label={playing ? `Pause ${r.title}` : `Play ${r.title}`}
                  >
                    <PlayIcon playing={playing} className="size-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(r.id);
                      setExpanded((x) => (x === r.id ? null : r.id));
                    }}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                  >
                    <span className={`truncate text-sm ${waiting ? "font-bold text-bone" : "font-medium text-mute"}`}>
                      {waiting && <span className="sr-only">Needs review: </span>}
                      {r.artist} - {r.title}
                    </span>
                    <span className={`truncate text-[11px] font-medium ${decision === "passed" ? "text-faint" : "text-mute"}`}>{r.meta.join(" · ")}</span>
                  </button>
                  {statusTag ? (
                    <span className={`shrink-0 text-xs ${decision === "kept" ? "text-bone" : "text-mute"}`}>
                      {decisionLabel(decision)}
                    </span>
                  ) : outcome ? (
                    <span className={`shrink-0 text-xs ${decision === "kept" ? "text-bone" : "text-mute"}`}>{outcome}</span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-medium text-faint" suppressHydrationWarning>
                      {age(r.createdAt)}
                    </span>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Waveform
                    peaks={r.peaks}
                    height={24}
                    progress={isCurrent && d ? player.time / d : 0}
                    onSeek={isCurrent ? player.seek : (f) => (player.play(toPlayer(r), queue), setTimeout(() => player.seek(f), 250))}
                    label={`Seek ${r.title}`}
                  />
                </div>
                <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                  {/* A status, not a control: plain text. */}
                  <span className="w-16 shrink-0 text-[11px] text-faint">{r.played ? "Listened" : ""}</span>
                  <DecisionButton kind="kept" title={r.title} pressed={decision === "kept"} onClick={() => decide(r, "kept", false)} />
                  <DecisionButton kind="passed" title={r.title} pressed={decision === "passed"} onClick={() => decide(r, "passed", false)} />
                  <button title="Reply (R)" aria-label={`Reply to ${r.sender}`} aria-pressed={open} onClick={() => (setSelected(r.id), setExpanded(open ? null : r.id))} className={`relative grid size-11 place-items-center ${open ? "text-bone" : "text-mute"}`}>
                    <FigmaIcon name="message-square" />
                    {r.replied && <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-bone" />}
                  </button>
                  <a href={`/api/tracks/${r.id}/download`} title="Download original" aria-label={`Download original of ${r.title}`} className="grid size-11 place-items-center text-mute">
                    <FigmaIcon name="download" />
                  </a>
                </div>
              </div>

              <div className={`hidden grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-4 py-3 transition md:grid @4xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] ${waiting ? "border-l-2 border-l-bone" : ""} ${selected === r.id ? "border-mute/60 bg-ink-4" : waiting ? "border-line bg-ink-3 hover:border-line-2" : "border-line bg-ink-2 hover:border-line-2"}`}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(r.id);
                    player.play(toPlayer(r), queue);
                  }}
                  className={`grid size-11 shrink-0 place-items-center rounded-lg border text-bone transition ${isCurrent ? "border-bone" : "border-line hover:border-mute"}`}
                  aria-label={playing ? `Pause ${r.title}` : `Play ${r.title}`}
                >
                  <PlayIcon playing={playing} className="size-3.5" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(r.id);
                    setExpanded((x) => (x === r.id ? null : r.id));
                  }}
                  aria-expanded={open}
                  className="min-w-0 text-left"
                >
                  <p className={`truncate text-[13px] ${waiting ? "font-bold text-bone" : "font-medium text-mute"}`}>
                    {waiting && <span className="sr-only">Needs review: </span>}
                    {r.artist} - {r.title}
                    {r.duplicateOf && <span className="ml-2 text-xs font-normal text-danger">· Possible duplicate</span>}
                  </p>
                  <p className="mt-1 flex items-center gap-2 truncate text-[11px] text-faint">
                    <span className="truncate">{r.meta.join(" · ")}</span>
                    {(statusTag || outcome) && (
                      <span className={`shrink-0 text-xs ${decision === "kept" ? "text-bone" : "text-mute"}`}>
                        {outcome ?? "Needs review"}
                      </span>
                    )}
                  </p>
                </button>

                <div className="hidden min-w-0 @4xl:block" onClick={(e) => e.stopPropagation()}>
                  <Waveform
                    peaks={r.peaks}
                    height={44}
                    progress={isCurrent && d ? player.time / d : 0}
                    onSeek={isCurrent ? player.seek : (f) => (player.play(toPlayer(r), queue), setTimeout(() => player.seek(f), 250))}
                    label={`Seek ${r.title}`}
                  />
                </div>

                <div className="flex items-center gap-0.5 sm:gap-1" onClick={(e) => e.stopPropagation()}>
                  <span className="hidden w-16 items-center justify-end gap-2 text-mute @2xl:flex">
                    {r.played && (
                      <span title="Listened">
                        <Icon.Headphones />
                        <span className="sr-only">Listened</span>
                      </span>
                    )}
                    {r.downloaded && (
                      <span title="Downloaded">
                        <Icon.Downloaded />
                        <span className="sr-only">Downloaded</span>
                      </span>
                    )}
                  </span>
                  <DecisionButton kind="kept" title={r.title} pressed={decision === "kept"} onClick={() => decide(r, "kept", false)} />
                  <DecisionButton kind="passed" title={r.title} pressed={decision === "passed"} onClick={() => decide(r, "passed", false)} />
                  <ActionButton label={`Reply to ${r.sender}`} tip="Reply" hint="R" pressed={open} onClick={() => (setSelected(r.id), setExpanded(open ? null : r.id))}>
                    <Icon.Bubble dot={r.replied} />
                  </ActionButton>
                  <a
                    href={`/api/tracks/${r.id}/download`}
                    title="Download original"
                    aria-label={`Download original of ${r.title}`}
                    className="grid size-11 place-items-center rounded-md text-bone/80 transition hover:bg-ink-3 hover:text-bone"
                  >
                    <Icon.Download />
                  </a>
                  <span className="hidden w-12 text-right text-[11px] text-faint tnum sm:block" title={new Date(r.createdAt).toLocaleString()} suppressHydrationWarning>
                    {age(r.createdAt)}
                  </span>
                </div>
              </div>

              {open && !picking && (
                <div className="mt-2 overflow-hidden rounded-panel md:mt-0 md:rounded-none">
                  <Expanded row={r} decision={decision} onClose={() => setExpanded(null)} />
                </div>
              )}
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
      <div className="mt-4 hidden items-center justify-between gap-4 rounded-xl border border-line bg-ink-2 px-4 py-3 text-[11px] text-faint md:flex">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            ["↑/↓", "select"],
            ["Space", "play"],
            ["K", "keep"],
            ["X", "not for me"],
            ["R", "reply"],
            ["Enter", "details"],
            ["1–4", "jump"],
            ["←/→", "10s"],
            ["U", "undo"],
          ].map(([k, v]) => (
            <span key={k}>
              <span className="font-bold text-bone">{k}</span> {v}
            </span>
          ))}
        </p>
        <span className="shrink-0 text-mute">{fmtCount(rows.length)}</span>
      </div>
    </>
  );
}

const fmtCount = (n: number) => `${n} track${n === 1 ? "" : "s"}`;

function Expanded({ row: r, decision, onClose }: { row: ListRow; decision: Decision | null; onClose: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);

  return (
    <div className="grid gap-5 border-t border-line/60 bg-ink/40 px-4 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:pl-[88px]">
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
          <span className={`chip ${r.senderVerified ? "border-lime/50 text-lime" : "border-line text-mute"}`}>
            {r.senderVerified ? "Verified" : "Unverified"}
          </span>
        </p>
        <p className="text-mute">
          {fmtTime(r.duration)}
          {r.mixLabel && ` · ${r.mixLabel}`} · {decisionLabel(decision)} ·{" "}
          {r.played ? "Listened" : "Not listened"} · {r.downloaded ? "Downloaded" : "Not downloaded"}
        </p>
        <Link href={`/dashboard/review?view=queue&s=all&t=${r.id}`} className="inline-block underline underline-offset-4 hover:text-lime">
          Open full review →
        </Link>
      </div>
      <form
        ref={form}
        // A plain submit, not a form action: React clears a form after its action, and a refused reply keeps its text.
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            // Says what really happened; a refused reply (a limit) stays open with its text.
            const res = await replyToSender(r.senderId, r.id, fd);
            toast.show({ message: res.message });
            if (res.status === "refused") return;
            form.current?.reset();
            onClose();
          });
        }}
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
  hint: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={hint}
      title={`${tip} (${hint})`}
      className={`grid size-11 place-items-center rounded-md transition hover:bg-ink-3 ${pressed ? "text-bone" : "text-mute hover:text-bone"}`}
    >
      {children}
    </button>
  );
}

/**
 * Keep and Not for me in a row, worded as on the decision rail: both neutral, Kept marked in bone (rule 15: lime is
 * the page's one main action, not a state repeated down a list). Never red, never a thumbs-down. 44px tall.
 */
function DecisionButton({ kind, title, pressed, onClick }: { kind: "kept" | "passed"; title: string; pressed: boolean; onClick: () => void }) {
  const keep = kind === "kept";
  return (
    <button
      onClick={onClick}
      aria-label={keep ? `Keep ${title}` : `Not for me: ${title}`}
      aria-pressed={pressed}
      aria-keyshortcuts={keep ? "K" : "X"}
      title={keep ? "Keep (K)" : "Not for me (X)"}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2.5 text-[12px] font-semibold transition ${
        keep
          ? pressed
            ? "border-bone bg-bone/10 text-bone"
            : "border-line text-bone hover:border-mute hover:bg-ink-4"
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
  Downloaded: () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4.5 19.5h15" />
    </svg>
  ),
  Headphones: () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden strokeLinejoin="round">
      <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Z" />
    </svg>
  ),
};

/** Icon exported from the Figma design, tinted with the current text colour. */
function FigmaIcon({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="block size-3.5 bg-current"
      style={{ mask: `url(/icons/${name}.svg) center / contain no-repeat`, WebkitMask: `url(/icons/${name}.svg) center / contain no-repeat` }}
    />
  );
}
