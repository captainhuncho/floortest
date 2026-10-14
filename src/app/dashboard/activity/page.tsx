import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q, type EventRow } from "@/lib/db";
import { AUDIT_LABELS, recentAudit } from "@/lib/audit";
import { prefsForView } from "@/lib/notify";
import { Tabs } from "@/components/Tabs";
import { SetLog, type LogEntry } from "./SetLog";

export const metadata = { title: "Activity — FloorTest" };

/** The filters keep their keys (and so their URLs); only the words changed. */
const FILTERS = [
  ["you", "Your actions", null],
  ["all", "Everything", null],
  ["decisions", "Decisions", ["kept", "passed"]],
  ["signals", "Sent to senders", ["played", "downloaded", "reply"]],
  ["intake", "Arrivals", ["submitted", "deleted", "expired", "blocked", "unblocked"]],
] as const;

type Key = (typeof FILTERS)[number][0];

/** Desk events in the log's words: the action alone, since the WHO column says who did it. */
const EVENT: Record<EventRow["type"], string> = {
  submitted: "Arrived",
  played: "Listened to",
  downloaded: "Downloaded",
  kept: "Kept",
  passed: "Not for me",
  note: "Private note",
  reply: "Replied",
  deleted: "Deleted",
  expired: "Auto-deleted",
  moved: "Moved",
  blocked: "Blocked a sender",
  unblocked: "Unblocked a sender",
  played_out: "Played out",
  shared: "Shared with a colleague",
};

/** Empty: one sentence on what will appear, and the one thing that makes it appear. */
const EMPTY: Record<Key, { text: string; action: string; href: string }> = {
  you: { text: "What's done on your desk shows up here, newest first: keeps, replies, settings.", action: "Start reviewing", href: "/dashboard/review?view=queue" },
  all: { text: "Everything that happens on your desk shows up here, starting with the first track someone sends to your link.", action: "Share your link", href: "/dashboard/floor" },
  decisions: { text: "Every Keep and Not for me shows up here as you review.", action: "Start reviewing", href: "/dashboard/review?view=queue" },
  signals: { text: "What senders see from you shows up here: listens, downloads and replies.", action: "Start reviewing", href: "/dashboard/review?view=queue" },
  intake: { text: "Tracks show up here as they arrive through your link.", action: "Share your link", href: "/dashboard/floor" },
};

export default async function Activity({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "activity");
  const f = (await searchParams).f;
  const filter = FILTERS.find(([k]) => k === f) ?? FILTERS[0];
  const key = filter[0];
  const types = filter[2];
  const teammate = user.actor_id !== user.id;
  // Someone with no name beside it was the account itself: "You" to the holder, the account's name to a teammate.
  const holder = teammate ? user.name : "You";
  const [prefs, mine, events] = await Promise.all([
    prefsForView(user.id),
    key === "you" ? recentAudit(user.id, 300, { teammate }) : [],
    key === "you"
      ? []
      : q.all<EventRow & { track_title: string | null; sender_name: string; actor_name: string | null }>(
          `SELECT e.*, t.title AS track_title, s.name AS sender_name, (SELECT a.name FROM users a WHERE a.id = e.actor_id AND e.actor_id <> e.user_id) AS actor_name FROM events e
       LEFT JOIN tracks t ON t.id = e.track_id JOIN senders s ON s.id = e.sender_id
       WHERE e.user_id = ? ${types ? `AND e.type IN (${types.map(() => "?").join(",")})` : "AND e.type != 'note'"}
       ORDER BY e.created_at DESC LIMIT 200`,
          user.id,
          ...(types ?? []),
        ),
  ]);
  const trackHref = (id: number | null) => (id ? `/dashboard/review?view=queue&s=all&t=${id}` : null);

  const entries: LogEntry[] =
    key === "you"
      ? mine.map((r) => ({
          key: `a${r.id}`,
          at: Number(r.created_at),
          what: AUDIT_LABELS[r.action] ?? r.action,
          object: r.detail || null,
          href: r.detail ? trackHref(r.track_id) : null,
          who: r.actor_name ?? holder,
        }))
      : events.map((e) => ({
          key: `e${e.id}`,
          at: Number(e.created_at),
          what: EVENT[e.type],
          object: e.track_title && e.type !== "note" && e.type !== "reply" ? `“${e.track_title}”` : null,
          href: e.track_title ? trackHref(e.track_id) : null,
          note: e.type === "moved" || e.type === "submitted" ? [e.type === "submitted" ? null : e.sender_name, e.detail].filter(Boolean).join(" · ") || null : e.sender_name,
          quote: e.type === "note" || e.type === "reply" ? e.detail : null,
          // Arrivals are the sender's doing, auto-deletes the desk's own rules; the rest someone on the desk did.
          who: e.type === "submitted" ? e.sender_name : e.type === "expired" ? "Automatic" : (e.actor_name ?? holder),
        }));
  const empty = EMPTY[key];

  return (
    <div className="page-gutter flex max-w-4xl flex-col gap-4 py-4 text-bone sm:py-6">
      <div className="flex items-center gap-3 border-b border-line pb-4 md:border-0 md:pb-0">
        <Link href="/dashboard/account" aria-label="Back to Account" className="text-[18px] leading-none md:hidden">
          ‹
        </Link>
        <h1 className="page-title">Activity</h1>
      </div>
      <p className="text-[12px] leading-[1.5] text-mute">
        {key === "you"
          ? teammate
            ? "Everything done on this desk, newest first, with the name of whoever did it. The account holder's own sign-ins and settings aren't shown."
            : "Everything done in your account, newest first. Your teammates' actions show their name."
          : "What happened on your desk, including what senders did."}
      </p>
      <Tabs
        label="Filter"
        value={key}
        className="-mx-4 px-4 sm:mx-0 sm:px-0"
        items={FILTERS.map(([k, label]) => ({ key: k, label, href: k === "you" ? "/dashboard/activity" : `/dashboard/activity?f=${k}` }))}
      />
      {entries.length ? (
        <SetLog entries={entries} tz={prefs.tz} />
      ) : (
        <div className="flex flex-col items-start gap-4 pt-4">
          <p className="max-w-prose text-[13px] text-mute">{empty.text}</p>
          <Link href={empty.href} className="btn-lime btn-sm">
            {empty.action}
          </Link>
        </div>
      )}
    </div>
  );
}
