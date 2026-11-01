"use client";

import Link from "next/link";
import { FILTERS, type Filter, type QueueRow } from "./model";

/** The signal's dot and words, coloured by kind (text stays ≥4.5:1 in both themes). */
export function SignalLine({ row, className = "" }: { row: QueueRow; className?: string }) {
  const text = row.kind ? row.words : (row.reviewedBy ? `Reviewed by ${row.reviewedBy}` : "No signals");
  return (
    <span data-kind={row.kind ?? "none"} className={`mq-sig ${className}`}>
      <span aria-hidden className="mq-dot" />
      <span className="truncate">{text}</span>
    </span>
  );
}

/**
 * The left pane: "Tracks with a signal · N", the search, the filter tabs with their counts, and the rows newest first.
 * A row is a link to its own address, so it opens in a new tab too; a plain click picks it in place.
 */
export function QueueList({
  rows,
  visible,
  total,
  counts,
  filter,
  onFilter,
  query,
  onQuery,
  search,
  chosen,
  hrefFor,
  onPick,
}: {
  rows: readonly QueueRow[];
  visible: readonly QueueRow[];
  total: number;
  counts: Record<Filter, number>;
  filter: Filter;
  onFilter: (f: Filter) => void;
  query: string;
  onQuery: (q: string) => void;
  search: string;
  chosen: string | null;
  hrefFor: (row: QueueRow) => string;
  onPick: (row: QueueRow) => void;
}) {
  return (
    <section aria-labelledby="mq-title" className="mq-list">
      <div className="mq-head">
        <h1 id="mq-title" className="text-[22px] font-bold leading-tight tracking-[-0.02em]">
          Moderation
        </h1>
        <p className="mt-0.5 text-[13px] text-faint">
          {search ? (
            <>
              Search · <span className="tnum">{total}</span> track{total === 1 ? "" : "s"} ·{" "}
              <Link href="/admin/moderation" className="text-bone underline underline-offset-2">
                Back to the queue
              </Link>
            </>
          ) : (
            <>
              Tracks with a signal · <span className="tnum">{total}</span> · newest first
            </>
          )}
        </p>
        <form role="search" action="/admin/moderation" className="mt-3">
          <input
            name="q"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            maxLength={100}
            className="input w-full"
            placeholder="Title, artist, sender or receipt"
            aria-label="Search tracks and senders"
            aria-describedby="mq-search-help"
          />
          <p id="mq-search-help" className="mt-1 text-[12px] text-faint">
            Filters this list as you type. Enter searches every track.
          </p>
        </form>
        <div role="group" aria-label="Filter by signal" className="mq-tabs mt-3">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)} className="mq-tab kit-press">
              {f.label} <span className="tnum text-faint">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {visible.length ? (
        <ul aria-label={search ? "Search results" : "Tracks with a signal"} className="mq-rows">
          {visible.map((r) => (
            <li key={r.key}>
              <Link
                href={hrefFor(r)}
                replace
                scroll={false}
                aria-current={r.key === chosen ? "true" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onPick(r);
                }}
                className="mq-row"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{r.title}</span>
                  <span className="shrink-0 font-mono text-[11.5px] text-faint">{r.age}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-faint">
                  {r.artist ? `${r.artist} · ` : ""}@{r.receiver}
                </span>
                <SignalLine row={r} className="mt-1.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mq-empty" role="status">
          <p className="font-semibold text-bone">{rows.length ? "No tracks match" : search ? "Nothing matches" : "No signals right now"}</p>
          <p className="mt-1 text-[13px] text-faint">
            {rows.length
              ? "Clear the search or the filter."
              : search
                ? "Try part of an email, or the artist name."
                : "Tracks appear here when they get a takedown claim, a blocked sender or a late scan."}
          </p>
        </div>
      )}
    </section>
  );
}
