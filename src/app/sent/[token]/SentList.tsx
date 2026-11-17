"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { CARD, Icon } from "@/components/Kit";
import { dayLabel, groupSends, SENT_FILTERS, type SentFilter } from "@/lib/sent-groups";

// The sender's time zone is their device's (senders have no account to keep one in). The server can't know it, so it
// renders in UTC; React hydrates with that same answer, then renders again with the browser's zone. Nothing to listen to.
const noChange = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const serverZone = () => "UTC";

/** One send as the list shows it. Only what a row prints, plus the three values the grouping and chips read. */
export type SentRow = {
  /** The receipt this row opens. */
  href: string;
  title: string;
  receiver: string;
  /** The strongest thing that has happened, and whether its dot is lit. */
  label: string;
  lit: boolean;
  /** How long ago that was; null on a dim row. */
  when: string | null;
  sentAt: number;
  listened: boolean;
  waiting: boolean;
};

/**
 * The sender's sends, grouped by when they were sent (This week, then months), under three chips that narrow the rows
 * already on the page. Nothing is fetched and the choice isn't saved. `now` comes from the server, so the first render
 * in the browser groups the rows exactly as the server did. Months and each row's date are in the sender's own time zone.
 */
export function SentList({ rows, now }: { rows: SentRow[]; now: number }) {
  const [filter, setFilter] = useState<SentFilter>("all");
  const id = useId();
  const zone = useSyncExternalStore(noChange, browserZone, serverZone);
  const groups = groupSends(rows, filter, now, zone);
  return (
    <>
      <div role="group" aria-label="Show" className="mt-3 flex gap-1.5">
        {SENT_FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.key)}
              className={`min-h-11 rounded-full border px-3.5 text-[14px] ${on ? "border-transparent bg-bone font-semibold text-ink" : "border-line bg-card text-bone hover:bg-well"}`}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      {groups.map((g, i) => (
        <section key={g.label} aria-labelledby={`${id}-${i}`} className="mt-2.5 flex flex-col gap-2">
          <h2 id={`${id}-${i}`} className="mx-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">
            {g.label}
          </h2>
          <ul aria-labelledby={`${id}-${i}`} className={`${CARD} px-3`}>
            {g.rows.map((r) => (
              <li key={r.href} className="border-t border-line first:border-t-0">
                <Link href={r.href} className="flex min-h-[60px] items-center gap-3 py-2">
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-well text-mute">
                    <Icon name="music" className="size-[22px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{r.title}</span>
                    <span className="block truncate text-[12px] leading-[1.4] text-mute">
                      to {r.receiver} · {dayLabel(r.sentAt, now, zone)}
                    </span>
                  </span>
                  <span className={`flex max-w-[9.5rem] shrink-0 items-start gap-1.5 text-right text-[12px] sm:max-w-none ${r.lit ? "font-semibold text-bone" : "text-dim"}`}>
                    <span aria-hidden className={`mt-[5px] size-[7px] shrink-0 rounded-full ${r.lit ? "bg-(--color-lime)" : "border border-line-2"}`} />
                    <span>
                      {r.label}
                      {/* Under the status on phones, beside it on wider screens. */}
                      {r.when && <span className="block font-normal text-dim sm:ml-1.5 sm:inline">{r.when}</span>}
                    </span>
                  </span>
                  <Icon name="chev" className="size-4 shrink-0 text-dim" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!groups.length && <p className="py-8 text-center text-[13px] text-mute">Nothing under {SENT_FILTERS.find((f) => f.key === filter)?.label}.</p>}
    </>
  );
}
