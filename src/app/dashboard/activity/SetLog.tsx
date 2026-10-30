import Link from "next/link";
import type { ReactNode } from "react";
import { CARD, Icon, type IconName } from "@/components/Kit";

/** One line of the log: when, what happened (to which track), and who did it. */
export type LogEntry = {
  key: string;
  at: number;
  /** The action: "Kept", "Reply sent", "Signed in". */
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
  /** The icon in the entry's box, and a tint for the good news (a keep) and our own words (a reply). */
  icon?: IconName;
  tone?: "up" | "acc";
};

/** An entry's icon box: green for a keep, lime for a reply, plain for the rest. */
function EntryIcon({ icon = "activity", tone }: { icon?: IconName; tone?: LogEntry["tone"] }) {
  const tones = {
    up: "border-transparent bg-[color-mix(in_oklab,#9be15d_14%,transparent)] text-[#6aa636]",
    acc: "border-transparent bg-lime/12 text-lime",
  };
  return (
    <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-[10px] border ${tone ? tones[tone] : "border-line bg-well text-bone"}`}>
      <Icon name={icon} className="size-4" />
    </span>
  );
}

/**
 * The desk's log: one card per day (the day and how many entries over its list), each entry an icon box, what happened
 * (to which track) with who did it and a note under it, and the time on the right. Same at every width.
 */
export function SetLog({ entries, tz }: { entries: LogEntry[]; tz: string }) {
  const days: { key: string; label: string; rows: LogEntry[] }[] = [];
  for (const e of entries) {
    const key = dayKey(e.at, tz);
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(e);
    else days.push({ key, label: dayLabel(e.at, tz), rows: [e] });
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((d) => (
        <section key={d.key} aria-label={d.label} className={`${CARD} flex flex-col gap-0.5 p-3`}>
          <div className="flex items-center justify-between gap-2 pb-1">
            <h2 className="text-[12px] font-semibold text-bone">{d.label}</h2>
            <span className="text-[11px] text-faint tnum">
              {d.rows.length} {d.rows.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <ol className="flex flex-col">
            {d.rows.map((e) => (
              <li key={e.key} className="flex min-h-11 items-start gap-2.5 border-t border-line py-2 first:border-t-0">
                <EntryIcon icon={e.icon} tone={e.tone} />
                <div className="min-w-0 flex-1 text-[12.5px] leading-[1.4]">
                  <p className="break-words text-bone">
                    {e.what}
                    {e.object &&
                      (e.href ? (
                        <Link href={e.href} className="font-semibold underline-offset-4 hover:underline">
                          {" "}
                          {e.object}
                        </Link>
                      ) : (
                        <b className="font-semibold"> {e.object}</b>
                      ))}
                  </p>
                  <p className="truncate text-[11.5px] text-mute">
                    {/* "by" is read out but not shown: the line under the action is always who did it first. */}
                    <span>
                      <span className="sr-only">by </span>
                      {e.who}
                    </span>
                    {e.note && <> · {e.note}</>}
                  </p>
                  {e.quote && <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap rounded-[11px] border border-line bg-well px-2.5 py-1.5 text-[12px] leading-[1.45] text-bone">{e.quote}</p>}
                </div>
                <time dateTime={new Date(e.at).toISOString()} className="shrink-0 pt-0.5 text-[11px] text-faint tnum">
                  {clock(e.at, tz)}
                </time>
              </li>
            ))}
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
