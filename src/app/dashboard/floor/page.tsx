import { trackUse } from "@/lib/usage";
import { Onboarding } from "./Onboarding";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { activeCollectionForView, capacityForView, collectionsForView, isClosed, isPaused } from "@/lib/desk";
import { now, q } from "@/lib/db";
import { atLeast, canApprove, heldReplies, seatsFor, seatsUsed, teamsOn } from "@/lib/account-members";
import { ago, fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { localHour, prefsForView } from "@/lib/notify";
import { homeStats } from "@/lib/stats";
import { SwitchCollection } from "./SwitchCollection";
import { CopyLinkBox } from "./CopyLinkBox";
import { SendMusicCard } from "./SendMusicCard";
import { UpNext } from "./UpNext";
import { PlayedOutCard } from "./PlayedOutCard";
import { playedOutPrompt } from "@/lib/played-out-prompt";

export const metadata = { title: "The Floor — FloorTest" };

/**
 * The Floor answers "what needs my attention?" before anything else: what's waiting, anything wrong with the link,
 * the next tracks to hear, what's ready for a set. The week's facts come after, as one line. The link and sending
 * close the page. Nothing here repeats a page of its own (Activity, Contacts).
 */
export default async function TheFloor({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  // Everything below is independent, so it all goes to the database at once.
  const [, sp, prefs, collections, active, cap, upNextRows, recentSends, oldestRow, staleRow] = await Promise.all([
    trackUse(user.id, "floor"),
    searchParams,
    prefsForView(user.id),
    collectionsForView(user.id),
    activeCollectionForView(user.active_collection_id),
    capacityForView(user.id, user.plan),
    q.all<{ id: number; title: string; artist: string; genre: string; duration: number | null; peaks: string | null; played_at: number | null; created_at: number; sender: string }>(`SELECT t.id, t.title, t.artist, t.genre, t.duration, t.peaks, t.played_at, t.created_at, s.name AS sender FROM tracks t
         JOIN senders s ON s.id = t.sender_id WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.decision IS NULL
         ORDER BY t.created_at DESC, t.id DESC LIMIT 6`, user.id),
    // FloorTest users you've sent music to from your account, most recent first.
    q.all<{ handle: string; name: string }>(
      `SELECT u.handle, u.name FROM senders s JOIN users u ON u.id = s.user_id
       WHERE s.account_id = ? AND u.suspended_at IS NULL
       GROUP BY u.id, u.handle, u.name ORDER BY MAX(s.created_at) DESC LIMIT 6`,
      user.id,
    ),
    // When the longest-waiting track arrived ("the oldest arrived 3 days ago"); Up next itself shows the newest.
    q.get<{ at: number | null }>("SELECT MIN(created_at) AS at FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND decision IS NULL", user.id),
    // Tracks close to the 7-day mark (the north star: a decision within 7 days of arriving).
    q.get<{ n: number }>("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND decision IS NULL AND created_at < ?", user.id, now() - STALE_DAYS * 86_400_000),
  ]);
  const welcome = !!sp.welcome;
  const stats = await homeStats(user.id, prefs.tz);
  const weekend = await playedOutPrompt({ ...user, tz: prefs.tz });
  const paused = isPaused(user);
  const link = `${APP_URL}/${user.handle}`;
  const upNext = upNextRows.map((t) => ({ ...t, peaks: t.peaks ? JSON.parse(t.peaks) : null, played: !!t.played_at }));
  const kept = collections.reduce((n, c) => n + c.kept, 0);
  const oldest = oldestRow?.at ? Number(oldestRow.at) : undefined;
  const stale = Number(staleRow?.n ?? 0);
  // A desk that has never had a track: sharing the link is the first job, so the link comes first.
  const fresh = welcome || (!stats.waiting && !kept && stats.receivedWeek + stats.receivedPrev === 0 && !stats.listenedSample);
  // First visit only: a greeting by first name; the public name can be a stage name or just the username.
  const first = user.first_name?.trim() || user.name.split(/\s+/)[0];
  const hour = localHour(prefs.tz);
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Link health: the one thing to fix, if anything.
  const openAlternative = collections.find((c) => !isClosed(c) && c.id !== active?.id);
  const problem: { text: string; action?: React.ReactNode } | null = paused
    ? { text: `Submissions are paused${user.pause_until ? ` until ${fmtDay(user.pause_until)}` : ""}. Switch “Taking submissions” back on in the sidebar when you're ready.` }
    : !active || isClosed(active)
      ? {
          text: active ? `Your link sends tracks to “${active.name}”, which closed on ${fmtDay(active.closes_at!)}. Nobody can send you music right now.` : "Your link isn't sending tracks anywhere.",
          // Pointing the link elsewhere is for the owner and admins.
          action: user.role === "member" ? undefined : openAlternative ? (
            <SwitchCollection id={openAlternative.id} name={openAlternative.name} />
          ) : (
            <Link href="/dashboard/collections" className="btn-lime btn-sm">
              New collection
            </Link>
          ),
        }
      : cap.full
        ? {
            text: "Your desk is full, so your link has stopped taking uploads.",
            action: (
              <Link href="/dashboard/plans" className="btn-lime btn-sm">
                See plans
              </Link>
            ),
          }
        : null;

  // A quiet desk has nothing to report yet; the line appears once something has happened.
  const facts = stats.receivedWeek + stats.receivedPrev + stats.keptWeek === 0 && !stats.listenedSample ? [] : [
    `${stats.receivedWeek} received this week${stats.receivedWeek !== stats.receivedPrev ? ` (${stats.receivedWeek > stats.receivedPrev ? "up" : "down"} from ${stats.receivedPrev})` : ""}`,
    `${stats.keptWeek} kept this week`,
    stats.medianListenMs !== null ? `first listen usually within ${waitWords(stats.medianListenMs)}` : null,
    stats.decisionRate !== null ? `${stats.decisionRate}% of the last 30 days decided` : null,
  ].filter(Boolean);

  // Your desk at a glance: only figures that mean exactly what they say, each a link to where it's managed. Capacity and
  // approvals turn lime when they need something from you. (Link status isn't repeated: "Your link" below says it.)
  const teamDesk = (await teamsOn()) && atLeast(user.role, "admin");
  const [seats, used, held, approver, contacts] = await Promise.all([
    teamDesk ? seatsFor(user.id) : 0,
    teamDesk ? seatsUsed(user.id) : 0,
    heldReplies(user),
    canApprove(user),
    q.get<{ n: number }>("SELECT COUNT(*) AS n FROM senders WHERE user_id = ?", user.id),
  ]);
  const nearLimit = cap.used >= cap.limit * 0.8;
  const desk: { key: string; href: string; text: string; urgent?: boolean }[] = [
    ...(held.length
      ? [{ key: "held", href: "/dashboard/settings/team", urgent: true, text: approver ? `${held.length} repl${held.length === 1 ? "y" : "ies"} waiting for your approval` : `${held.length} of your repl${held.length === 1 ? "y is" : "ies are"} waiting for approval` }]
      : []),
    ...(teamDesk && seats > 1 ? [{ key: "seats", href: "/dashboard/settings/team", text: `${used} of ${seats} seats` }] : []),
    // Near the limit with kept tracks, the way out is downloading and clearing them (Prepare), before any upgrade.
    { key: "cap", href: nearLimit && kept > 0 ? "/dashboard/prepare" : "/dashboard/account", urgent: nearLimit, text: `${cap.used.toLocaleString("en-GB")} of ${cap.limit.toLocaleString("en-GB")} active tracks` },
    { key: "cols", href: "/dashboard/collections", text: `${collections.length} collection${collections.length === 1 ? "" : "s"}` },
    { key: "contacts", href: "/dashboard/contacts", text: `${Number(contacts?.n ?? 0)} contact${Number(contacts?.n ?? 0) === 1 ? "" : "s"}` },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-5 sm:px-8 sm:py-8">
      {/* What needs you: the waiting count is the page title, and the one button is the daily job. */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone sm:text-[32px]">
              {welcome ? `Welcome, ${first}.` : `${greeting}, ${first}.`}
            </h1>
            <p className="text-[13px] text-mute">
              {welcome
                ? "Your link is ready. Share it and the first track lands here."
                : stats.waiting
                  ? `${stats.waiting} track${stats.waiting === 1 ? " is" : "s are"} waiting for you${oldest ? `; the oldest arrived ${ago(oldest)}` : ""}.`
                  : kept
                    ? `You're all caught up. ${kept} kept track${kept === 1 ? " is" : "s are"} ready for your set.`
                    : "You're all caught up. New tracks will show up here first."}
            </p>
            {stale > 0 && (
              <Link href="/dashboard/review?view=queue" className="w-fit text-[13px] font-semibold text-bone underline underline-offset-4">
                {stale} track{stale === 1 ? " has" : "s have"} waited over {STALE_DAYS} days. The queue starts with {stale === 1 ? "it" : "them"} →
              </Link>
            )}
          </div>
          {stats.waiting > 0 && (
            <Link href="/dashboard/review?view=queue" className="btn-lime shrink-0">
              Start reviewing
            </Link>
          )}
        </div>
      </header>

      {problem && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />
          <p className="min-w-[12rem] flex-1 text-[13px] font-medium leading-snug text-bone">{problem.text}</p>
          {problem.action}
        </div>
      )}

      {weekend && <PlayedOutCard titles={weekend.tracks.map((t) => t.title)} />}

      {upNext.length > 0 && (
        <section aria-labelledby="next-h" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="next-h" className="eyebrow">Up next</h2>
            {stats.waiting > upNext.length && (
              <Link href="/dashboard/review?view=queue" className="text-[12px] font-bold text-mute hover:text-bone">
                All {stats.waiting} →
              </Link>
            )}
          </div>
          <UpNext items={upNext} />
        </section>
      )}

      {/* The checklist helps a new desk; on a busy one the queue comes first. */}
      {/* Setting up the account is for the owner and admins; members skip the checklist. */}
      {user.role !== "member" && <Onboarding user={user} />}

      {kept > 0 && (
        <section aria-labelledby="set-h" className="flex items-center justify-between gap-4 border-t border-line pt-5">
          <div className="min-w-0">
            <h2 id="set-h" className="text-[14px] font-semibold text-bone">
              {kept} kept track{kept === 1 ? "" : "s"} ready for your set
            </h2>
            <p className="text-[12px] text-dim">
              {nearLimit
                ? `Your desk is nearly full (${cap.used} of ${cap.limit}). Download them, then clear kept to make room.`
                : "Download them as a crate with a Rekordbox playlist."}
            </p>
          </div>
          <Link href="/dashboard/prepare" className="btn-ghost btn-sm shrink-0">
            Prepare
          </Link>
        </section>
      )}

      {facts.length > 0 && (
        <section aria-labelledby="week-h" className="flex flex-col gap-1.5 border-t border-line pt-5">
          <h2 id="week-h" className="eyebrow">This week</h2>
          <p className="text-[13px] leading-6 text-mute">{facts.join(" · ")}.</p>
        </section>
      )}

      {!fresh && (
        <section aria-labelledby="desk-h" className="flex flex-col gap-1.5 border-t border-line pt-5">
          <h2 id="desk-h" className="eyebrow">Your desk</h2>
          <p className="text-[13px] leading-6 text-mute">
            {desk.map((d, i) => (
              <span key={d.key}>
                {i > 0 && " · "}
                <Link href={d.href} className={`tnum underline-offset-4 hover:underline ${d.urgent ? "font-semibold text-lime" : "hover:text-bone"}`}>
                  {d.text}
                </Link>
              </span>
            ))}
            .
          </p>
        </section>
      )}

      <section aria-labelledby="link-h" className={`flex flex-col gap-3 border-t border-line pt-5 ${fresh ? "order-first border-t-0 pt-0" : ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="link-h" className="eyebrow">Your link</h2>
          <p className="text-[12px] text-dim">
            {problem
              ? "Not taking uploads right now"
              : active
                ? `Sends tracks to “${active.name}”${active.closes_at ? `, open until ${fmtDay(active.closes_at)}` : ""}`
                : "No collection selected"}
            {" · "}
            <Link href="/dashboard/collections" className="text-mute underline-offset-4 hover:text-bone hover:underline">
              Collections
            </Link>
          </p>
        </div>
        <CopyLinkBox link={link} />
      </section>

      {/* On a team desk, Members can't send as the account. */}
      {user.role !== "member" && (
        <div className="border-t border-line pt-5">
          <SendMusicCard recent={recentSends} host={APP_URL.replace(/^https?:\/\//, "")} />
        </div>
      )}
    </div>
  );
}

/** Waiting this long gets a nudge on the Floor, two days before the 7-day mark the desk aims for. */
const STALE_DAYS = 5;

/** "under an hour", "5 hours", "3 days": how long a first listen usually takes, in words. */
function waitWords(ms: number) {
  const h = ms / 3_600_000;
  if (h < 1) return "under an hour";
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}
