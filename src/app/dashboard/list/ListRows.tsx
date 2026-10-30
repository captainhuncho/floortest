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
import { CARD, Chip, Icon as KitIcon } from "@/components/Kit";

/** The quiet button in the list's head (Select / Done). */
const GHOST = "inline-flex min-h-9 items-center rounded-[10px] border border-line bg-well px-3 text-[12px] font-semibold text-bone transition hover:border-line-2 pointer-coarse:min-h-11";

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


/**
 * One card of track rows: a compact line per track on phones (the row opens the track in the Queue), the full row with
 * Keep, Not for me, reply and download on desktop. `statusTag` shows Needs review instead of the age (collection detail).
 */
export function ListRows({
  rows,
  statusTag = false,
  collections = [],
  title,
}: {
  rows: ListRow[];
  statusTag?: boolean;
  collections?: { id: number; name: string }[];
  /** The list's heading inside its card (the List view's status, "All tracks"); without it the card shows the count. */
  title?: string;
}) {
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

  // The open track in the Queue, where a phone listens and decides (owner, 30 Oct: phones scan here, decide there).
  const queueHref = (id: number) => `/dashboard/review?view=queue&s=all&t=${id}`;
  // The age chip is lime while a track is unheard and undecided, like the Queue's list; decided tracks show the outcome.
  const tag = (r: ListRow, decision: Decision | null) =>
    decision ? (
      <Chip tone={decision === "kept" ? "up" : "flat"}>{decisionLabel(decision)}</Chip>
    ) : statusTag ? (
      <Chip tone="warn">Needs review</Chip>
    ) : (
      <span suppressHydrationWarning>
        <Chip tone={r.played ? "flat" : "acc"}>{age(r.createdAt)}</Chip>
      </span>
    );

  return (
    <section aria-label={title ? undefined : "Tracks"} aria-labelledby={title ? "list-h" : undefined} className={`${CARD} flex flex-col p-1.5 md:p-2`}>
      <div className="flex min-h-11 items-center justify-between gap-2 px-2">
        {picking ? (
          <label className="flex min-h-11 items-center gap-2.5 text-[12px] text-mute">
            <input
              type="checkbox"
              className="size-5 accent-lime"
              aria-label="Select all tracks"
              checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(rows.slice(0, BATCH_MAX).map((r) => r.id)))}
            />
            Select all{rows.length > BATCH_MAX ? ` (first ${BATCH_MAX})` : ` (${rows.length})`}
          </label>
        ) : title ? (
          <h2 id="list-h" className="flex items-baseline gap-1.5 text-[15px] font-semibold tracking-[-0.015em] text-bone">
            {title}
            <span className="text-[11.5px] font-normal text-mute tnum">{rows.length}</span>
          </h2>
        ) : (
          <span className="text-[11.5px] text-mute tnum">{fmtCount(rows.length)}</span>
        )}
        <button type="button" className={GHOST} onClick={() => (picking ? stopPicking() : setPicking(true))}>
          {picking ? "Done" : "Select"}
        </button>
      </div>
      <ul ref={listRef} className="@container flex flex-col" aria-label="Review Queue">
        {rows.map((r, i) => {
          const isCurrent = player.current?.id === r.id;
          const playing = isCurrent && player.playing;
          const d = player.duration || r.duration || 0;
          const decision = decisionOf(r);
          const open = expanded === r.id;
          const waiting = !decision;
          const ticked = picked.has(r.id);
          const sub = [r.artist, ...r.meta].join(" · ");
          const play = (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelected(r.id);
                player.play(toPlayer(r), queue);
              }}
              className={`grid size-11 shrink-0 place-items-center rounded-[11px] border bg-well transition ${isCurrent ? "border-lime/50 text-lime" : "border-line text-bone hover:border-line-2"}`}
              aria-label={playing ? `Pause ${r.title}` : `Play ${r.title}`}
            >
              <PlayIcon playing={playing} className="size-3.5" />
            </button>
          );
          const name = (
            <>
              <span className={`truncate text-[13px] ${waiting ? "font-semibold text-bone" : "font-medium text-mute"}`}>
                {waiting && <span className="sr-only">Needs review: </span>}
                {r.title}
                {r.duplicateOf && <span className="ml-2 text-[11.5px] font-normal text-danger">· Possible duplicate</span>}
              </span>
              <span className="truncate text-[11.5px] text-mute">{sub}</span>
            </>
          );
          return (
            <li
              key={r.id}
              data-row={r.id}
              aria-current={selected === r.id ? "true" : undefined}
              onClick={() => (picking ? toggle(r.id) : setSelected(r.id))}
              className={`relative ${i ? "border-t border-line" : ""} ${selected === r.id && !picking ? "rounded-[12px] border-t-transparent bg-well shadow-[inset_2px_0_0_var(--color-lime)] [&+li]:border-t-transparent" : ""} ${ticked ? "rounded-[12px] border-t-transparent bg-lime/8 [&+li]:border-t-transparent" : ""}`}
            >
              {/* Select mode: the whole row ticks the track, so a stray tap never plays, keeps or opens it. */}
              {picking && <button type="button" tabIndex={-1} aria-hidden className="absolute inset-0 z-10 cursor-pointer rounded-[12px]" onClick={(e) => (e.stopPropagation(), toggle(r.id))} />}

              {/* Phones: one compact line per track to scan; the row opens the track in the Queue to listen and decide. */}
              <div className="flex min-h-14 items-center gap-2.5 px-2 py-1.5 md:hidden">
                {picking ? (
                  <input
                    type="checkbox"
                    className="relative z-20 m-3 size-5 shrink-0 accent-lime"
                    checked={ticked}
                    onChange={() => toggle(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${r.artist} - ${r.title}`}
                  />
                ) : (
                  play
                )}
                <Link href={queueHref(r.id)} className="flex min-w-0 flex-1 flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                  {name}
                </Link>
                <span className="shrink-0">{tag(r, decision)}</span>
              </div>

              {/* Desktop: the fast view, deciding on the row with the keyboard or a click. */}
              <div className="hidden items-center gap-3 px-2 py-1.5 md:flex">
                {picking && (
                  <input
                    type="checkbox"
                    className="relative z-20 size-5 shrink-0 accent-lime"
                    checked={ticked}
                    onChange={() => toggle(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${r.artist} - ${r.title}`}
                  />
                )}
                {play}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(r.id);
                    setExpanded((x) => (x === r.id ? null : r.id));
                  }}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                >
                  {name}
                </button>
                <div className="hidden w-[min(28%,240px)] min-w-0 @4xl:block" onClick={(e) => e.stopPropagation()}>
                  <Waveform
                    peaks={r.peaks}
                    height={30}
                    progress={isCurrent && d ? player.time / d : 0}
                    onSeek={isCurrent ? player.seek : (f) => (player.play(toPlayer(r), queue), setTimeout(() => player.seek(f), 250))}
                    label={`Seek ${r.title}`}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <span className="hidden w-10 items-center justify-end gap-1.5 text-faint @2xl:flex">
                    {r.played && (
                      <span title="Listened">
                        <KitIcon name="head" className="size-[15px]" />
                        <span className="sr-only">Listened</span>
                      </span>
                    )}
                    {r.downloaded && (
                      <span title="Downloaded">
                        <KitIcon name="dl" className="size-[15px]" />
                        <span className="sr-only">Downloaded</span>
                      </span>
                    )}
                  </span>
                  <DecisionButton kind="kept" title={r.title} pressed={decision === "kept"} onClick={() => decide(r, "kept", false)} />
                  <DecisionButton kind="passed" title={r.title} pressed={decision === "passed"} onClick={() => decide(r, "passed", false)} />
                  <ActionButton label={`Reply to ${r.sender}`} tip="Reply" hint="R" pressed={open} onClick={() => (setSelected(r.id), setExpanded(open ? null : r.id))}>
                    <Bubble dot={r.replied} />
                  </ActionButton>
                  <a
                    href={`/api/tracks/${r.id}/download`}
                    title="Download original"
                    aria-label={`Download original of ${r.title}`}
                    className="grid size-9 place-items-center rounded-[10px] text-mute transition hover:bg-well hover:text-bone pointer-coarse:size-11"
                  >
                    <KitIcon name="dl" className="size-[18px]" />
                  </a>
                  {/* The buttons already say Kept or Not for me, so desktop ends on the age (lime while unheard). */}
                  <span className="flex w-10 justify-end" title={new Date(r.createdAt).toLocaleString()} suppressHydrationWarning>
                    <Chip tone={!decision && !r.played ? "acc" : "flat"}>{age(r.createdAt)}</Chip>
                  </span>
                </div>
              </div>

              {open && !picking && (
                <div className="hidden md:block">
                  <Expanded row={r} decision={decision} onClose={() => setExpanded(null)} />
                </div>
              )}
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
      <p className="mt-1.5 hidden flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-line-2 px-2 pt-2.5 pb-1 text-[11px] text-faint md:flex">
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
            <span className="font-semibold text-mute">{k}</span> {v}
          </span>
        ))}
      </p>
    </section>
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
    <div className="mx-2 mb-2 grid gap-5 rounded-[12px] border border-line bg-well p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3 text-sm">
        {r.message ? (
          <figure className="rounded-[11px] border border-line bg-card p-3">
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
          className="input mt-2 min-h-24 resize-y rounded-xl! bg-card! max-sm:text-base"
          placeholder="Sent by email"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.current?.requestSubmit();
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-lime min-h-9 rounded-[10px]" disabled={pending}>
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
      className={`grid size-9 place-items-center rounded-[10px] transition hover:bg-well pointer-coarse:size-11 ${pressed ? "bg-well text-bone" : "text-mute hover:text-bone"}`}
    >
      {children}
    </button>
  );
}

/**
 * Keep and Not for me on a desktop row, worded as on the decision rail. Kept takes the green the Kept tag uses; Not for
 * me stays plain. Lime stays the page's one main action. Never red, never a thumbs-down. 36px, 44px on touch screens.
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
      className={`inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[10px] border px-2.5 text-[12px] font-semibold transition pointer-coarse:min-h-11 ${
        pressed
          ? keep
            ? "border-transparent bg-[color-mix(in_oklab,#9be15d_14%,transparent)] text-[#6aa636]"
            : "border-line-2 bg-ink-4 text-bone"
          : `border-line bg-well hover:border-line-2 ${keep ? "text-bone" : "text-mute hover:text-bone"}`
      }`}
    >
      {keep ? (pressed ? "Kept" : "Keep") : "Not for me"}
    </button>
  );
}

/** The reply icon, with a lime dot once you've replied. */
function Bubble({ dot }: { dot: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden strokeLinejoin="round">
      <path d="M12 4c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-1 0-2-.1-2.9-.4L4.5 20l1.2-3.8a6.8 6.8 0 0 1-2.2-5C3.5 7.2 7.3 4 12 4Z" />
      {dot && <circle cx="18.5" cy="5.5" r="3" fill="var(--color-lime)" stroke="none" />}
    </svg>
  );
}
