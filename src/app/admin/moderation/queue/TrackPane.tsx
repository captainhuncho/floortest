"use client";

import Link from "next/link";
import { Waveform } from "@/components/Waveform";
import { ModerationPlayer, type PlayerHandle } from "../ModerationPlayer";
import type { TrackDetail } from "./data";
import type { QueueRow } from "./model";

const ICON: Record<string, string> = {
  takedown: "M5 21V4h11l-1.5 4L16 12H5",
  blocked_sender: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5.6 5.6l12.8 12.8",
  late_scan: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z",
  none: "M5 12.5l4.5 4.5L19 7.5",
};

/** The signal in words, in a box under the track's name. */
export function SignalBanner({ row }: { row: QueueRow }) {
  return (
    <div className="mq-banner" data-kind={row.kind ?? "none"}>
      <svg viewBox="0 0 24 24" aria-hidden className="mt-0.5 size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON[row.kind ?? "none"]} />
      </svg>
      <div className="min-w-0">
        <p className="font-semibold text-bone">{row.kind ? row.words : row.reviewedBy ? `Reviewed by ${row.reviewedBy}` : "No signals"}</p>
        <p className="mt-0.5 text-[13px] text-mute">{row.detail}</p>
        {row.kind === "late_scan" && (
          <Link href="/admin/jobs" className="mt-1 inline-flex min-h-11 items-center text-[13px] font-semibold text-bone underline underline-offset-2">
            Open Jobs
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * The player for a track with an open takedown claim, and only for one (src/lib/staff-listen.ts; the audio route
 * refuses the rest too). Any other track shows its waveform still, with the line saying why.
 */
export function Listen({ d, handle, compact = false }: { d: TrackDetail; handle?: React.Ref<PlayerHandle>; compact?: boolean }) {
  if (d.playable) return <ModerationPlayer key={d.track_id} id={d.track_id} title={d.title} artist={d.artist} peaks={d.peaks} duration={d.duration} handle={handle} />;
  return (
    <div className="mt-4">
      <Waveform peaks={d.peaks} height={compact ? 40 : 56} dim label={`Waveform of ${d.title}, ${d.length}. Listening is off for this track.`} />
      <p className="mt-2.5 flex items-center gap-2 text-[13px] text-mute">
        <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
        </svg>
        Listening is only for tracks with an open takedown claim.
      </p>
    </div>
  );
}

/** The middle pane: the track, its signal, the player or still waveform, the sender's facts and the track's history. */
export function TrackPane({
  row,
  detail,
  loading,
  position,
  handle,
  onDecide,
}: {
  row: QueueRow;
  detail: TrackDetail | null;
  loading: boolean;
  position: string | null;
  handle: React.Ref<PlayerHandle>;
  onDecide: (from: HTMLElement) => void;
}) {
  const d = detail;
  return (
    <section aria-labelledby="mq-track" aria-busy={loading || (!!row.track_id && !d) || undefined} className="mq-body">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-faint">
            {position ? `${position} · ` : ""}
            {row.kind ? `signal ${row.age} ago` : `received ${row.age} ago`}
          </p>
          <h2 id="mq-track" className="mt-0.5 truncate text-[26px] font-bold leading-tight tracking-[-0.03em]" title={row.title}>
            {row.title}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-mute">
            {row.artist ? `${row.artist} · ` : ""}to @{row.receiver}
            {d && (
              <span className="font-mono text-[12px] text-faint">
                {" "}
                · {d.length} · {d.size}
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={(e) => onDecide(e.currentTarget)} className="mq-decide btn-lime btn-sm min-h-11 shrink-0">
          Decide
        </button>
      </div>
      <SignalBanner row={row} />
      {row.track_id && !d && <p className="mt-4 text-[13px] text-faint">Opening the track…</p>}
      {d && (
        <>
          <Listen d={d} handle={handle} />
          <div className="mq-two">
            <section aria-labelledby="mq-sender" className="mq-card">
              <h3 id="mq-sender" className="text-[13px] font-semibold">
                Sender
              </h3>
              <dl className="mq-kv">
                <dt>Name</dt>
                <dd className="truncate">{d.sender}</dd>
                <dt>Email</dt>
                <dd className="truncate font-mono text-[12px]">{d.email}</dd>
                <dt>Tracks</dt>
                <dd className="tnum">{d.history.tracks}</dd>
                <dt>Receivers</dt>
                <dd className="tnum">{d.history.receivers}</dd>
                <dt>Blocked by</dt>
                <dd className={`tnum ${d.history.blocked ? "text-danger" : ""}`}>{d.history.blocked}</dd>
                <dt>Sent to</dt>
                <dd className="truncate">
                  <Link href={`/admin/accounts/${d.user_id}`} className="underline-offset-2 hover:underline">
                    @{d.receiver}
                  </Link>
                </dd>
                <dt>Received</dt>
                <dd>{d.received}</dd>
                <dt>Reviewed</dt>
                <dd>{d.reviewed ?? <span className="text-faint">Not yet</span>}</dd>
              </dl>
            </section>
            <section aria-labelledby="mq-history" className="mq-card">
              <h3 id="mq-history" className="text-[13px] font-semibold">
                History
              </h3>
              {d.events.length ? (
                <ol className="mq-tl">
                  {d.events.map((e, i) => (
                    <li key={i}>
                      <span className="font-mono text-[11.5px] text-faint">{e.at}</span> <span className="text-bone">{e.type}</span>
                      {e.detail && <span className="text-mute"> · {e.detail}</span>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-[13px] text-faint">Nothing recorded yet.</p>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
