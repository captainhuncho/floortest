"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { isTyping, PlayIcon, usePlayer } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { Waveform } from "@/components/Waveform";
import type { Decision } from "@/lib/db";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import { clearDecision, decideTrack, replyToSender, undoDecision } from "../actions";
import { QuickReplies } from "../QuickReplies";
import { ReplyTemplates } from "../ReplyTemplates";

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

const initials = (s: string) =>
  s
    .split(/[\s&,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** `statusTag` swaps the age for a Needs review / Kept / Not for me tag (Figma collection detail). */
export function ListRows({ rows, statusTag = false }: { rows: ListRow[]; statusTag?: boolean }) {
  const player = usePlayer();
  const toast = useToast();
  const [selected, setSelected] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision | null>>({});
  const [, start] = useTransition();
  const queue = rows.map(toPlayer);
  const listRef = useRef<HTMLUListElement>(null);

  // Server data wins once it arrives.
  useEffect(() => setDecisions({}), [rows]);

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
      else if (e.key === "ArrowRight") player.seekBy(10);
      else if (e.key === "ArrowLeft") player.seekBy(-10);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, select, decide, player, queue, toast]);

  return (
    <>
      <ul ref={listRef} className="@container space-y-2.5 px-3 font-[family-name:var(--font-stage-mono)] md:space-y-2 md:px-0" aria-label="Review Queue">
        {rows.map((r) => {
          const isCurrent = player.current?.id === r.id;
          const playing = isCurrent && player.playing;
          const d = player.duration || r.duration || 0;
          const decision = decisionOf(r);
          const open = expanded === r.id;
          return (
            <li
              key={r.id}
              data-row={r.id}
              aria-current={selected === r.id ? "true" : undefined}
              onClick={() => setSelected(r.id)}
              className={`group transition ${decision === "passed" ? "opacity-60" : ""}`}
            >
              {/* Phones: Figma "track-card" */}
              <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-ink-3 p-3 md:hidden">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(r.id);
                      player.play(toPlayer(r), queue);
                    }}
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-ink"
                    aria-label={playing ? `Pause ${r.title}` : `Play ${r.title}`}
                  >
                    {playing ? (
                      <PlayIcon playing className="size-3" />
                    ) : isCurrent ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/icons/card-play.svg" alt="" className="size-3" />
                    ) : (
                      initials(r.artist)
                    )}
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
                    <span className="truncate text-sm font-bold text-bone">
                      {r.artist} - {r.title}
                    </span>
                    <span className="truncate text-[10px] font-medium text-mute">{r.meta.join(" · ")}</span>
                  </button>
                  {statusTag ? (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                        decision === "kept" ? "bg-white/10 text-white" : "bg-line text-mute"
                      }`}
                    >
                      {decision === "kept" ? "Kept" : decision === "passed" ? "Not for me" : "Needs review"}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] font-medium text-faint" suppressHydrationWarning>
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
                  <span title={r.played ? "Listened" : "Not listened yet"} className={`grid size-9 place-items-center ${r.played ? "text-bone" : "text-mute"}`}>
                    <FigmaIcon name="headphones" />
                    <span className="sr-only">{r.played ? "Listened" : "Not listened yet"}</span>
                  </span>
                  <button aria-label={`Keep ${r.title}`} aria-pressed={decision === "kept"} onClick={() => decide(r, "kept", false)} className={`grid size-9 place-items-center ${decision === "kept" ? "text-bone" : "text-mute"}`}>
                    <FigmaIcon name="heart" />
                  </button>
                  <button aria-label={`Not for me: ${r.title}`} aria-pressed={decision === "passed"} onClick={() => decide(r, "passed", false)} className={`grid size-9 place-items-center ${decision === "passed" ? "text-bone" : "text-mute"}`}>
                    <FigmaIcon name="thumbs-down" />
                  </button>
                  <button aria-label={`Reply to ${r.sender}`} aria-pressed={open} onClick={() => (setSelected(r.id), setExpanded(open ? null : r.id))} className={`relative grid size-9 place-items-center ${open ? "text-bone" : "text-mute"}`}>
                    <FigmaIcon name="message-square" />
                    {r.replied && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-lime" />}
                  </button>
                  <a href={`/api/tracks/${r.id}/download`} aria-label={`Download original of ${r.title}`} className="grid size-9 place-items-center text-mute">
                    <FigmaIcon name="download" />
                  </a>
                </div>
              </div>

              <div className={`hidden grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-4 py-3 transition md:grid @4xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] ${selected === r.id ? "border-mute/60 bg-ink-4" : "border-line bg-ink-3 hover:border-line-2"}`}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(r.id);
                    player.play(toPlayer(r), queue);
                  }}
                  className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-bone text-[11px] font-bold text-ink"
                  aria-label={playing ? `Pause ${r.title}` : `Play ${r.title}`}
                >
                  <span className={`transition ${isCurrent ? "opacity-0" : "group-hover:opacity-0"}`}>{initials(r.artist)}</span>
                  <span
                    className={`absolute inset-0 grid place-items-center bg-bone transition ${isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  >
                    <PlayIcon playing={playing} className="h-4 w-4 text-ink" />
                  </span>
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
                  <p className="truncate text-[13px] font-bold">
                    {r.artist} - {r.title}
                    {r.duplicateOf && <span className="chip ml-2 align-middle border-danger/40 text-[11px] font-normal text-danger">Possible duplicate</span>}
                  </p>
                  <p className="mt-1 flex items-center gap-2 truncate text-[10px] text-faint">
                    <span className="truncate">{r.meta.join(" · ")}</span>
                    {statusTag && (
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${decision === "kept" ? "bg-bone/10 text-bone" : "bg-line text-mute"}`}>
                        {decision === "kept" ? "Kept" : decision === "passed" ? "Not for me" : "Needs review"}
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
                  <ActionButton label={`Keep ${r.title}`} tip="Keep" hint="K" pressed={decision === "kept"} onClick={() => decide(r, "kept", false)}>
                    <Icon.Heart filled={decision === "kept"} />
                  </ActionButton>
                  <ActionButton label={`Not for me: ${r.title}`} tip="Not for me" hint="X" pressed={decision === "passed"} onClick={() => decide(r, "passed", false)}>
                    <Icon.ThumbDown filled={decision === "passed"} />
                  </ActionButton>
                  <ActionButton label={`Reply to ${r.sender}`} tip="Reply" hint="R" pressed={open} onClick={() => (setSelected(r.id), setExpanded(open ? null : r.id))}>
                    <Icon.Bubble dot={r.replied} />
                  </ActionButton>
                  <a
                    href={`/api/tracks/${r.id}/download`}
                    title="Download original"
                    aria-label={`Download original of ${r.title}`}
                    className="grid h-10 w-10 place-items-center rounded-md text-bone/80 transition hover:bg-ink-3 hover:text-bone"
                  >
                    <Icon.Download />
                  </a>
                  <span className="hidden w-12 text-right text-[10px] text-faint tnum sm:block" title={new Date(r.createdAt).toLocaleString()} suppressHydrationWarning>
                    {age(r.createdAt)}
                  </span>
                </div>
              </div>

              {open && (
                <div className="mt-2 overflow-hidden rounded-[14px] md:mt-0 md:rounded-none">
                  <Expanded row={r} decision={decision} onClose={() => setExpanded(null)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 hidden items-center justify-between gap-4 rounded-xl border border-line bg-ink-2 px-4 py-3 font-[family-name:var(--font-stage-mono)] text-[10px] text-faint md:flex">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            ["↑/↓", "select"],
            ["Space", "play"],
            ["K", "keep"],
            ["X", "not for me"],
            ["R", "reply"],
            ["Enter", "details"],
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
          <figure className="rounded-lg border-l-2 border-lime bg-ink-2 p-3">
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
          {r.mixLabel && ` · ${r.mixLabel}`} · {decision === "kept" ? "Kept" : decision === "passed" ? "Not for me" : "Needs review"} ·{" "}
          {r.played ? "Listened" : "Not listened"} · {r.downloaded ? "Downloaded" : "Not downloaded"}
        </p>
        <Link href={`/dashboard?view=queue&s=all&t=${r.id}`} className="inline-block underline underline-offset-4 hover:text-lime">
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
      className={`grid h-10 w-10 place-items-center rounded-md transition hover:bg-ink-3 ${pressed ? "text-bone" : "text-mute hover:text-bone"}`}
    >
      {children}
    </button>
  );
}

const svg = "h-[22px] w-[22px]";
const Icon = {
  Heart: ({ filled }: { filled: boolean }) => (
    <svg viewBox="0 0 24 24" className={svg} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.5 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.5 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" strokeLinejoin="round" />
    </svg>
  ),
  ThumbDown: ({ filled }: { filled: boolean }) => (
    <svg viewBox="0 0 24 24" className={svg} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden strokeLinejoin="round">
      <path d="M17 3.5h3v10h-3zM17 13.5l-4 7a2 2 0 0 1-2.8-2.3l1-3.7H5.4a2 2 0 0 1-2-2.4l1.4-6.5a2 2 0 0 1 2-1.6H17" />
    </svg>
  ),
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
