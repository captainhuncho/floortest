import { EmptyState } from "@/components/Feedback";
import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q, type EventRow } from "@/lib/db";
import { AUDIT_LABELS, recentAudit, type AuditAction } from "@/lib/audit";
import { prefsForView } from "@/lib/notify";
import { CARD, Icon, PageHead, SEG, segTab, type IconName } from "@/components/Kit";
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

/** Each desk event's icon; a keep is good news (green), a reply our own words (lime). */
const EVENT_ICON: Record<EventRow["type"], { icon: IconName; tone?: LogEntry["tone"] }> = {
  submitted: { icon: "inbox" },
  played: { icon: "head" },
  downloaded: { icon: "dl" },
  kept: { icon: "heart", tone: "up" },
  passed: { icon: "x" },
  note: { icon: "tag" },
  reply: { icon: "reply", tone: "acc" },
  deleted: { icon: "x" },
  expired: { icon: "clock" },
  moved: { icon: "folder" },
  blocked: { icon: "shield" },
  unblocked: { icon: "shield" },
  played_out: { icon: "star" },
  shared: { icon: "share" },
};

/** Your own actions' icons, by what kind of thing they touched; anything not listed gets the plain activity line. */
function auditIcon(action: AuditAction): { icon: IconName; tone?: LogEntry["tone"] } {
  if (action === "kept") return { icon: "heart", tone: "up" };
  if (action === "replied" || action === "reply_approved") return { icon: "reply", tone: "acc" };
  const byPrefix: [string, IconName][] = [
    ["signin_alerts", "shield"],
    ["sign", "lock"],
    ["password", "lock"],
    ["passkey", "lock"],
    ["two_factor", "lock"],
    ["google", "lock"],
    ["app_token", "lock"],
    ["reply", "reply"],
    ["passed", "x"],
    ["decision", "clock"],
    ["listened", "head"],
    ["downloaded", "dl"],
    ["exported", "dl"],
    ["set_", "prep"],
    ["moved", "folder"],
    ["deleted", "x"],
    ["played_out", "star"],
    ["noted", "tag"],
    ["blocked", "shield"],
    ["unblocked", "shield"],
    ["link_", "link"],
    ["collection_activated", "link"],
    ["collection", "folder"],
    ["team", "contacts"],
    ["share", "share"],
    ["stems", "music"],
    ["plan", "card"],
    ["identity", "user"],
    ["notifications", "bell"],
    ["digest", "mail"],
  ];
  const hit = byPrefix.find(([p]) => action.startsWith(p));
  return { icon: hit ? hit[1] : action.endsWith("_updated") || action.startsWith("cover") ? "gear" : "activity" };
}

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
          ...auditIcon(r.action),
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
          ...EVENT_ICON[e.type],
        }));
  const empty = EMPTY[key];

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
        <Link href="/dashboard/account" className="tap-text -ml-0.5 inline-flex w-fit items-center gap-1.5 text-[12px] text-mute hover:text-bone md:hidden">
          <Icon name="chev" className="size-3.5 rotate-180" />
          <span>
            <span className="sr-only">Back to </span>Account
          </span>
        </Link>
        <PageHead
          title="Activity"
          label={
            key === "you"
              ? teammate
                ? "Everything done on this desk, newest first. The account holder's sign-ins and settings aren't shown."
                : "Everything done on your desk, newest first."
              : "What happened on your desk, including what senders did."
          }
        />
        {/* Five filters outgrow a phone: the track scrolls sideways inside the gutter, never the page. */}
        <nav aria-label="Filter" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className={SEG}>
            {FILTERS.map(([k, label]) => (
              <Link
                key={k}
                href={k === "you" ? "/dashboard/activity" : `/dashboard/activity?f=${k}`}
                aria-current={k === key ? "page" : undefined}
                className={`${segTab(k === key)} pointer-coarse:min-h-11`}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
        {entries.length ? (
          <SetLog entries={entries} tz={prefs.tz} />
        ) : (
          <div className={`${CARD} px-3`}>
            <EmptyState icon="activity" action={{ href: empty.href, label: empty.action }}>
              {empty.text}
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
