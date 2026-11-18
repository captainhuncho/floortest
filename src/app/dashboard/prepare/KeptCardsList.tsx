"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Dialog, DIALOG_QUIET } from "@/components/Dialog";
import { Icon } from "@/components/Kit";
import { PlayerWaveform, PlayIcon, usePlayer } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import type { PlayedOutStatus } from "@/lib/played-out-prompt";
import { playedOutBatch, replyToSender } from "../actions/review";
import { MoreDots, ROUND } from "../collections/FolderRow";
import type { Row } from "../TrackList";

/** One line in a track's ••• sheet: 48px, the whole width. */
const ITEM = "flex min-h-12 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[14px] font-medium text-bone transition-colors hover:bg-well disabled:opacity-50";

/**
 * Prepare's tracks (owner, 17 Nov: option 44): numbered rows, as on a folder's page. The row plays the track, with the
 * rest of the crate as the queue. Phones: title, "artist · BPM · length" and the status under it. From lg: title and
 * artist, the waveform (seek) and length from 1180px, BPM, status. The status reads Kept, Downloaded or Played out
 * (lime). Everything else about a track is behind its •••: Played it out first (`canMark`: DJ desks, owner and
 * A&R / Admin, tracks the sender cleared for sets), Download this track, Open in the Queue, Reply, Details.
 */
export function KeptCardsList({ rows, status, senders, canMark }: { rows: Row[]; status: Record<number, PlayedOutStatus>; /** Track id → sender id. */ senders: Record<number, number>; canMark: boolean }) {
  const { current, playing, duration, play, toggle, seek } = usePlayer();
  const toast = useToast();
  const [pending, start] = useTransition();
  // Marked here a moment ago shows straight away; a failed save takes it back.
  const [marks, setMarks] = useState<Record<number, boolean>>({});
  const [menu, setMenu] = useState<{ id: number; view: "menu" | "details" | "reply" } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const queue = rows.map(toPlayer);
  const playedOut = (id: number) => (id in marks ? marks[id] : !!status[id]?.at);
  const open = menu ? rows.find((r) => r.id === menu.id) : undefined;
  const close = () => setMenu(null);

  const mark = (r: Row) => {
    const fail = () => {
      setMarks((m) => ({ ...m, [r.id]: false }));
      toast.show({ message: "Couldn't save that. Nothing changed. Try again.", tone: "error" });
    };
    setMarks((m) => ({ ...m, [r.id]: true }));
    close();
    start(async () => {
      try {
        if (await playedOutBatch([r.id], "", "prepare")) toast.show({ message: `${r.sender} will hear their track was played out` });
        else fail();
      } catch {
        fail();
      }
    });
  };

  const reply = (r: Row, fd: FormData) =>
    start(async () => {
      // Says what really happened; a refused reply (a limit) stays open with its text.
      const res = await replyToSender(senders[r.id], r.id, fd);
      toast.show({ message: res.message, tone: res.status === "refused" ? "error" : "done" });
      if (res.status !== "refused") close();
    });

  return (
    <>
      <div aria-hidden className="hidden items-center gap-3 border-b border-line px-1 pb-2 text-[11.5px] text-faint lg:flex">
        <span className="w-6 text-center">#</span>
        <span className="min-w-0 flex-1">Title</span>
        <span className="hidden w-[min(30%,260px)] min-[1180px]:block" />
        <span className="w-12 text-right">BPM</span>
        <span className="hidden w-12 text-right min-[1180px]:block">Time</span>
        <span className="w-28">Status</span>
        <span className="w-11" />
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {rows.map((r, i) => {
          const on = current?.id === r.id;
          const d = (on && duration) || r.duration || 0;
          const tag = <StatusTag playedOut={playedOut(r.id)} downloaded={r.downloaded} />;
          return (
            <li key={r.id} className="flex min-h-16 items-center gap-2.5 px-1 py-1.5 lg:min-h-14 lg:gap-3">
              <span aria-hidden className={`grid w-6 shrink-0 place-items-center text-[12px] tnum ${on ? "text-bone" : "text-mute"}`}>
                {on ? <PlayIcon playing={playing} className="size-3" /> : i + 1}
              </span>
              <button
                type="button"
                onClick={() => (on ? toggle() : play(toPlayer(r), queue))}
                aria-label={`${on && playing ? "Pause" : "Play"} ${r.title} by ${r.artist}`}
                className="flex min-w-0 flex-1 flex-col items-start gap-0.5 py-1 text-left"
              >
                <span className="max-w-full truncate text-[14px] font-semibold tracking-[-0.01em] text-bone">{r.title}</span>
                <span className="max-w-full truncate text-[12px] text-mute tnum lg:hidden">{[r.artist, r.bpm ? `${Math.round(r.bpm)} BPM` : null, r.duration ? fmtTime(r.duration) : null].filter(Boolean).join(" · ")}</span>
                <span className="hidden max-w-full truncate text-[12px] text-mute lg:block">{r.artist}</span>
                <span className="lg:hidden">{tag}</span>
              </button>
              <div className="hidden w-[min(30%,260px)] min-w-0 shrink-0 min-[1180px]:block">
                <PlayerWaveform on={on} length={d} peaks={r.peaks} height={26} onSeek={on ? seek : (f) => (play(toPlayer(r), queue), setTimeout(() => seek(f), 250))} label={`Seek ${r.title}`} />
              </div>
              <span className="hidden w-12 shrink-0 text-right font-mono text-[12px] text-mute tnum lg:block">
                {r.bpm ? Math.round(r.bpm) : ""}
                {r.bpm ? <span className="sr-only"> BPM</span> : null}
              </span>
              <span className="hidden w-12 shrink-0 text-right font-mono text-[12px] text-mute tnum min-[1180px]:block">{r.duration ? fmtTime(r.duration) : ""}</span>
              <span className="hidden w-28 shrink-0 lg:block">{tag}</span>
              <button type="button" onClick={() => setMenu({ id: r.id, view: "menu" })} aria-label={`More for ${r.title}`} aria-haspopup="dialog" className={ROUND}>
                <MoreDots />
              </button>
            </li>
          );
        })}
      </ol>

      <Dialog
        open={!!open}
        onClose={close}
        busy={pending && menu?.view === "reply"}
        title={open ? (menu?.view === "reply" ? `Reply to ${open.sender}` : `${open.title} · ${open.artist}`) : ""}
        actions={
          open && menu?.view === "reply" ? (
            <>
              <button type="button" className={DIALOG_QUIET} disabled={pending} onClick={() => setMenu({ id: open.id, view: "menu" })}>
                Back
              </button>
              <button type="button" className={DIALOG_QUIET} disabled={pending} onClick={() => form.current?.requestSubmit()}>
                {pending ? "Sending…" : "Send reply"}
              </button>
            </>
          ) : open && menu?.view === "details" ? (
            <button type="button" className={DIALOG_QUIET} onClick={() => setMenu({ id: open.id, view: "menu" })}>
              Back
            </button>
          ) : undefined
        }
      >
        {open && menu?.view === "menu" && <TrackMenu row={open} status={status[open.id]} playedOut={playedOut(open.id)} canMark={canMark} canReply={open.id in senders} pending={pending} onMark={() => mark(open)} onView={(view) => setMenu({ id: open.id, view })} onClose={close} />}
        {open && menu?.view === "details" && <Details row={open} status={status[open.id]} playedOut={playedOut(open.id)} />}
        {open && menu?.view === "reply" && (
          <form
            ref={form}
            // A plain submit, not a form action: React clears a form after its action, and a refused reply keeps its text.
            onSubmit={(e) => {
              e.preventDefault();
              reply(open, new FormData(e.currentTarget));
            }}
          >
            <label htmlFor={`reply-${open.id}`} className="sr-only">
              Message to {open.sender}
            </label>
            <textarea id={`reply-${open.id}`} name="body" required maxLength={4000} data-autofocus className="input min-h-28 resize-y text-base" placeholder="Sent by email" />
          </form>
        )}
      </Dialog>
    </>
  );
}

/** Where a kept track stands: Played out (lime), Downloaded (with a tick) or Kept. */
function StatusTag({ playedOut, downloaded }: { playedOut: boolean; downloaded: boolean }) {
  if (playedOut) return <span className="text-[12px] font-semibold text-lime">Played out</span>;
  if (downloaded)
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-mute">
        <Icon name="check" className="size-3.5" />
        Downloaded
      </span>
    );
  return <span className="text-[12px] text-mute">Kept</span>;
}

function TrackMenu({
  row: r,
  status,
  playedOut,
  canMark,
  canReply,
  pending,
  onMark,
  onView,
  onClose,
}: {
  row: Row;
  status: PlayedOutStatus | undefined;
  playedOut: boolean;
  canMark: boolean;
  canReply: boolean;
  pending: boolean;
  onMark: () => void;
  onView: (view: "details" | "reply") => void;
  onClose: () => void;
}) {
  // Played it out is for DJ desks, on tracks the sender cleared for sets; evaluation-only tracks say to ask first.
  const markable = canMark && !!status && !playedOut;
  return (
    <div className="-mx-2 flex flex-col">
      {markable && !status.setsOk && <p className="px-3 pb-2 text-[13px] text-[#d98a2b]">Evaluation only: ask {r.sender} before playing it out.</p>}
      {markable && status.setsOk && (
        <button type="button" className={ITEM} disabled={pending} onClick={onMark}>
          Played it out
        </button>
      )}
      <a href={`/api/tracks/${r.id}/download`} className={ITEM} onClick={onClose}>
        Download this track
      </a>
      <Link href={`/dashboard/review?view=queue&s=all&t=${r.id}`} className={ITEM}>
        Open in the Queue
      </Link>
      {canReply && (
        <button type="button" className={ITEM} onClick={() => onView("reply")}>
          Reply to {r.sender}
        </button>
      )}
      <button type="button" className={ITEM} onClick={() => onView("details")}>
        Details
      </button>
    </div>
  );
}

/** A track's facts, as rows: what the list has no room for, with energy and cues when they're set. */
function Details({ row: r, status, playedOut }: { row: Row; status: PlayedOutStatus | undefined; playedOut: boolean }) {
  const facts: [string, React.ReactNode][] = [
    ["Sent by", r.sender],
    ["Callout", r.collection],
    ["Genre", r.genre],
    ["BPM", r.bpm ? Math.round(r.bpm) : null],
    ["Length", r.duration ? fmtTime(r.duration) : null],
    ["Arrived", new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })],
    ["Status", [playedOut ? "Played out" : "Kept", r.downloaded ? "Downloaded" : r.played ? "Listened" : "Not played"].join(" · ")],
    ["Played out note", playedOut ? status?.note : null],
    ["Energy", r.energy ? `E${r.energy}` : null],
    ["Cues", r.cueCount ? r.cueCount : null],
  ];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
      {facts
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-mute">{k}</dt>
            <dd className="text-bone tnum [overflow-wrap:anywhere]">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
