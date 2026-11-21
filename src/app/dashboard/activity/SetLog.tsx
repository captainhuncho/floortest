import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/Kit";
import { DayFold } from "./DayFold";

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
  /** The icon in the entry's box; a keep's heart is the one thing tinted (lime). */
  icon?: IconName;
  tone?: "up";
};

/** An entry's icon square: the card surface (raised inside the laptop card), the icon in the text colour; lime only for a keep. */
function EntryIcon({ icon = "activity", tone }: { icon?: IconName; tone?: LogEntry["tone"] }) {
  return (
    <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-[10px] bg-card lg:bg-ink-4 ${tone === "up" ? "text-lime" : "text-bone"}`}>
      <Icon name={icon} className="size-4" />
    </span>
  );
}

/** One line of the log: icon, what happened (to which track), who and the note under it, a quote if any, the time. */
function Entry({ e, tz }: { e: LogEntry; tz: string }) {
  return (
    <div className="box-border flex min-h-14 items-start gap-3 py-2.5">
      <EntryIcon icon={e.icon} tone={e.tone} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-[15px] leading-[1.35] text-bone">
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
        <p className="mt-0.5 truncate text-[13px] text-mute">
          {/* "by" is read out but not shown: the line under the action is always who did it first. */}
          <span>
            <span className="sr-only">by </span>
            {e.who}
          </span>
          {e.note && <> · {e.note}</>}
        </p>
        {e.quote && <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-xl border border-line bg-card px-3 py-2 text-[14px] leading-[1.45] text-bone lg:bg-ink-4">{e.quote}</p>}
      </div>
      <time dateTime={new Date(e.at).toISOString()} className="shrink-0 pt-0.5 text-[12px] text-faint tnum">
        {clock(e.at, tz)}
      </time>
    </div>
  );
}

/**
 * The desk's log, option 60 A (owner, 19 Nov): one list, a plain heading over each day (the day on the left, how many
 * entries on the right, a hairline under), a hairline between rows, and a busy day folded after eight. On a laptop the
 * whole log sits in one card.
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
    <div className="flex flex-col gap-2.5 lg:rounded-2xl lg:border lg:border-line lg:bg-card lg:px-4 lg:pt-1 lg:pb-2">
      {days.map((d) => (
        <section key={d.key} aria-label={d.label}>
          <div className="flex items-baseline justify-between gap-2 border-b border-line py-1.5">
            <h2 className="text-[13px] font-semibold text-bone">{d.label}</h2>
            <span className="text-[12px] text-faint tnum">
              {d.rows.length} {d.rows.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <DayFold label={d.label} rows={d.rows.map((e) => <Entry key={e.key} e={e} tz={tz} />)} />
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
