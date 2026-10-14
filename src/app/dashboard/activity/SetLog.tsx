import Link from "next/link";
import type { ReactNode } from "react";

/** One line of the log: when, what happened (to which track), and who did it. */
export type LogEntry = {
  key: string;
  at: number;
  /** The action, bold: "Kept", "Reply sent", "Signed in". */
  what: string;
  /** The track or thing it was done to, after the action. */
  object?: string | null;
  /** Where the object opens (the track in the Queue). */
  href?: string | null;
  /** A quieter second line: the sender, where a track moved to, a reply's words. */
  note?: ReactNode;
  /** A reply or private note: the words themselves, set apart under the line. */
  quote?: string | null;
  /** The person (a teammate, "You", the sender, or "Automatic"). */
  who: string;
};

/**
 * The desk's log, laid out like the set log on the home page: TIME | WHAT | WHO in tabular mono, one 1px rule between
 * entries, the day as an eyebrow over its entries. Phones get two lines per entry: what happened, then time · who.
 */
export function SetLog({ entries, tz }: { entries: LogEntry[]; tz: string }) {
  const days: { key: string; label: string; rows: LogEntry[] }[] = [];
  for (const e of entries) {
    const key = dayKey(e.at, tz);
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(e);
    else days.push({ key, label: dayLabel(e.at, tz), rows: [e] });
  }
  const grid = "sm:grid sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:gap-6 lg:grid-cols-[4rem_minmax(0,1fr)_13rem]";

  return (
    <div>
      <div aria-hidden className={`hidden border-b border-line pb-2 text-[10px] uppercase tracking-[0.12em] text-faint ${grid}`}>
        <span>Time</span>
        <span>What</span>
        <span>Who</span>
      </div>
      {days.map((d) => (
        <section key={d.key} aria-label={d.label}>
          <h2 className="eyebrow pt-6 pb-2">{d.label}</h2>
          <ol className="border-t border-line">
            {d.rows.map((e) => {
              const time = clock(e.at, tz);
              return (
                <li key={e.key} className={`flex flex-col gap-1 border-b border-line py-3 ${grid}`}>
                  <time dateTime={new Date(e.at).toISOString()} className="tnum hidden pt-px text-xs text-faint sm:block">
                    {time}
                  </time>
                  <div className="min-w-0 text-[13px] leading-5">
                    <p className="break-words">
                      <span className="font-bold text-bone">{e.what}</span>
                      {e.object &&
                        (e.href ? (
                          <Link href={e.href} className="text-mute underline-offset-4 hover:text-bone hover:underline">
                            {" "}
                            {e.object}
                          </Link>
                        ) : (
                          <span className="text-mute"> {e.object}</span>
                        ))}
                    </p>
                    {e.note && <p className="truncate text-xs text-faint">{e.note}</p>}
                    {e.quote && <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap border-l border-line-2 pl-3 text-xs text-mute">{e.quote}</p>}
                  </div>
                  {/* "by" is read out but not shown: the column says it. */}
                  <span className="hidden truncate pt-px text-xs text-mute sm:block">
                    <span className="sr-only">by </span>
                    {e.who}
                  </span>
                  <p className="tnum text-xs text-faint sm:hidden">
                    {time} · <span className="sr-only">by </span>
                    {e.who}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

const dayKey = (ts: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);

/** "Today", "Yesterday", "Mon 13 Oct" (the year only when it isn't this one). */
function dayLabel(ts: number, tz: string) {
  const now = Date.now();
  const k = dayKey(ts, tz);
  if (k === dayKey(now, tz)) return "Today";
  if (k === dayKey(now - 86_400_000, tz)) return "Yesterday";
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(ts);
}

const clock = (ts: number, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(ts);
