import { trackUse } from "@/lib/usage";
import { CapacityStrip } from "@/components/CapacityStrip";
import { Onboarding } from "./Onboarding";
import Link from "next/link";
import { requireUser, viewingAs } from "@/lib/auth";
import { switchOn } from "@/lib/switches";
import { VerifyBanner } from "../VerifyBanner";
import { activeCollectionForView, canAddCollection, capacityForView, collectionsForView, isClosed, isPaused } from "@/lib/desk";
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

export const metadata = { title: "Floor — FloorTest" };

/**
 * The Floor answers "what needs my attention?" before anything else: what's waiting, anything wrong with the link,
 * the next tracks to hear, what's ready for a set. The desk side holds one panel (how full the desk is, the week's
 * numbers, the desk's links), the link and sending. From 1280px the two sit side by side. Nothing here repeats a page
 * of its own (Activity, Contacts).
 */
export default async function TheFloor({ searchParams }: { searchParams: Promise<{ welcome?: string; desk?: string }> }) {
  const user = await requireUser();
  // Everything below is independent, so it all goes to the database at once.
  const [, sp, prefs, collections, active, cap, upNextRows, recentSends, oldestRow, staleRow, view] = await Promise.all([
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
    // An admin viewing this desk doesn't get the confirm-your-email banner.
    viewingAs(),
  ]);
  const welcome = !!sp.welcome;
  const stats = await homeStats(user.id, prefs.tz);
  const weekend = await playedOutPrompt({ ...user, tz: prefs.tz });
  const paused = isPaused(user);
  const link = `${APP_URL}/${user.handle}`;
  // Each row's age is worked out here, once, so the server and the browser agree on it.
  const upNext = upNextRows.map((t) => ({ ...t, peaks: t.peaks ? JSON.parse(t.peaks) : null, played: !!t.played_at, age: ago(Number(t.created_at)) }));
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
  const canSend = user.role !== "member" && (await switchOn("send_music", user));
  const canAdd = !openAlternative && active && isClosed(active) ? await canAddCollection(user.id) : true;
  const problem: { text: string; action?: React.ReactNode } | null = paused
    ? // The Link open switch lives on Account (the sidebar only links there), so the fix points there.
      {
        text: `Your link is paused${user.pause_until ? ` until ${fmtDay(user.pause_until)}` : ""}. Turn it back on in Account when you're ready.`,
        action: user.role === "member" ? undefined : (
          <Link href="/dashboard/account" className="btn-ghost btn-sm">
            Open Account
          </Link>
        ),
      }
    : // No collection is not a problem: the link stays open and tracks land in the Review Queue, unsorted (intake.ts).
      active && isClosed(active)
      ? {
          text: `Your link sends tracks to “${active.name}”, which closed on ${fmtDay(active.closes_at!)}. Nobody can send you music right now.`,
          // Pointing the link elsewhere is for the owner and admins.
          action: user.role === "member" ? undefined : openAlternative ? (
            <SwitchCollection id={openAlternative.id} name={openAlternative.name} />
          ) : (
            <Link href="/dashboard/collections" className="btn-lime btn-sm">
              {canAdd ? "New collection" : "Open Collections"}
            </Link>
          ),
        }
      : cap.full
        ? {
            // Every track that isn't deleted counts toward the limit (kept ones too, even after a new batch in Prepare),
            // so room comes from deleting tracks you're done with, or a bigger plan.
            text: `Your desk holds ${cap.limit.toLocaleString("en-GB")} active tracks and it's full, so your link has stopped taking new ones. Download what you need from Prepare, then delete tracks you're done with in the Review Queue to make room.`,
            action: (
              <span className="flex flex-wrap gap-2">
                <Link href="/dashboard/prepare" className="btn-lime btn-sm">
                  Open Prepare
                </Link>
                <Link href="/dashboard/plans" className="btn-ghost btn-sm">
                  See plans
                </Link>
              </span>
            ),
          }
        : null;

  // A quiet desk has nothing to report yet; the week appears once something has happened. The number is the point, the
  // label says what it counts, the line under it its scope.
  const delta = stats.receivedWeek - stats.receivedPrev;
  const week: { key: string; label: string; value: string; sub: string }[] =
    stats.receivedWeek + stats.receivedPrev + stats.keptWeek === 0 && !stats.listenedSample
      ? []
      : [
          { key: "in", label: "Received", value: String(stats.receivedWeek), sub: delta === 0 ? "Same as last week" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} on last week` },
          { key: "kept", label: "Kept", value: String(stats.keptWeek), sub: "This week" },
          ...(stats.medianListenMs !== null ? [{ key: "listen", label: "First listen", value: waitShort(stats.medianListenMs), sub: "Typical, 30 days" }] : []),
          ...(stats.decisionRate !== null ? [{ key: "decided", label: "Decided", value: `${stats.decisionRate}%`, sub: "Last 30 days" }] : []),
        ];

  // Your desk at a glance: only figures that mean exactly what they say, each a link to where it's managed. Approvals
  // turn lime when they need something from you. Capacity has its own strip above the list.
  const teamDesk = (await teamsOn(user.id)) && atLeast(user.role, "admin");
  const [seats, used, held, approver, contacts] = await Promise.all([
    teamDesk ? seatsFor(user.id) : 0,
    teamDesk ? seatsUsed(user.id) : 0,
    heldReplies(user),
    canApprove(user),
    q.get<{ n: number }>("SELECT COUNT(*) AS n FROM senders WHERE user_id = ?", user.id),
  ]);
  const nearLimit = cap.used >= cap.limit * 0.8;
  // Near the limit with kept tracks, the way out is downloading and clearing them (Prepare), before any upgrade.
  const capHref = nearLimit && kept > 0 ? "/dashboard/prepare" : "/dashboard/account";
  const desk: { key: string; href: string; text: string; urgent?: boolean }[] = [
    ...(held.length
      ? [{ key: "held", href: "/dashboard/settings/team", urgent: true, text: approver ? `${held.length} repl${held.length === 1 ? "y" : "ies"} waiting for your approval` : `${held.length} of your repl${held.length === 1 ? "y is" : "ies are"} waiting for approval` }]
      : []),
    ...(teamDesk && seats > 1 ? [{ key: "seats", href: "/dashboard/settings/team", text: `${used} of ${seats} seats` }] : []),
    { key: "cols", href: "/dashboard/collections", text: `${collections.length} collection${collections.length === 1 ? "" : "s"}` },
    { key: "contacts", href: "/dashboard/contacts", text: `${Number(contacts?.n ?? 0)} contact${Number(contacts?.n ?? 0) === 1 ? "" : "s"}` },
  ];

  // Where the link sends, and the way to change it: under the link in the desk column, beside its heading on a new desk.
  const linkWhere = (
    <>
      {problem
        ? "Not taking uploads right now"
        : active
          ? `Sends tracks to “${active.name}”${active.closes_at ? `, open until ${fmtDay(active.closes_at)}` : ""}`
          : "Sends tracks to your Review Queue"}
      {" · "}
      <Link href="/dashboard/collections" className="text-mute underline-offset-4 hover:text-bone hover:underline">
        Collections
      </Link>
    </>
  );

  // A new desk's link, on its own above the checklist.
  const linkSection = (
    <section aria-labelledby="link-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="link-h" className="eyebrow">Your link</h2>
        <p className="text-[12px] text-dim">{linkWhere}</p>
      </div>
      <CopyLinkBox link={link} />
    </section>
  );

  // The desk panel: how full the desk is, the week's readings and the desk's links, one panel divided by hairlines.
  const deskPanel = !fresh && (
    <div className="panel overflow-hidden">
      <section aria-labelledby="cap-h" className="flex flex-col gap-2.5 px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="cap-h" className="eyebrow">Active tracks</h2>
          <Link href={capHref} className={`font-mono text-[13px] tnum underline-offset-4 hover:underline ${nearLimit ? "font-semibold text-lime" : "text-faint hover:text-bone"}`}>
            <strong className={`text-[17px] ${nearLimit ? "" : "text-bone"}`}>{cap.used.toLocaleString("en-GB")}</strong> of {cap.limit.toLocaleString("en-GB")}
          </Link>
        </div>
        <CapacityStrip used={cap.used} limit={cap.limit} />
        <p className="text-[12px] text-faint">Striped slots are free. Waiting, kept and not-for-me tracks all count.</p>
      </section>
      {week.length > 0 && (
        <section aria-labelledby="week-h" className="border-t border-line">
          <h2 id="week-h" className="eyebrow px-4 pt-3.5 pb-2.5">This week</h2>
          <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4 xl:grid-cols-2">
            {week.map((w) => (
              <div key={w.key} className="flex min-w-0 flex-col gap-0.5 bg-ink-3 px-4 py-3">
                <dt className="text-[12px] font-semibold text-mute">{w.label}</dt>
                <dd className="font-mono text-[20px] font-bold leading-7 text-bone tnum">{w.value}</dd>
                <dd className="text-[11px] leading-4 text-faint">{w.sub}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <section aria-labelledby="desk-h" className="border-t border-line">
        <h2 id="desk-h" className="sr-only">Your desk</h2>
        <ul className="divide-y divide-line">
          {desk.map((d) => {
            // The figure leads in bone, like a readout; the link's name stays the whole sentence.
            const [, n, rest] = /^([\d,]+)(.*)$/.exec(d.text) ?? [null, "", d.text];
            return (
              <li key={d.key}>
                <Link
                  href={d.href}
                  className={`group flex min-h-11 items-center gap-2 px-4 py-2.5 text-[13px] ${d.urgent ? "font-semibold text-lime" : "text-mute hover:text-bone"}`}
                >
                  {d.urgent && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime" />}
                  <span className="min-w-0 flex-1">
                    <span className={`tnum font-bold ${d.urgent ? "" : "text-bone"}`}>{n}</span>
                    {rest}
                  </span>
                  <span aria-hidden className="text-faint transition-transform duration-150 ease-out group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );

  return (
    <>
    {!view && !user.email_verified_at && <VerifyBanner email={user.email} />}
    {/*
      Rule 15 Floor (owner, 28 Oct: the mock's layout). One column on phones and tablets; from 1280px the work on the left
      (Up next, setting up, what's ready for a set) and the desk on the right (how full it is, the week, the link, sending).
      What needs you stays on top at every width: the waiting count, the one lime button, anything wrong.
    */}
    <div className="page-gutter py-5 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-7 xl:max-w-6xl">
        {/* The count is the headline: one big number, its unit beside it, one sentence on how long they've waited,
            and one button that says where it starts (the queue plays oldest first). */}
        {sp.desk === "ended" && (
          <p role="alert" className="rounded-lg border border-danger/40 px-4 py-3 text-sm">
            You don&apos;t have access to that team&apos;s desk any more, so nothing was changed. This is your own desk.
          </p>
        )}
        <header className="flex flex-col items-stretch gap-5 sm:items-start">
          <div className="flex min-w-0 flex-col gap-2">
            {!welcome && <p className="text-sm text-mute">{greeting}, {first}</p>}
            {welcome || !stats.waiting ? (
              <h1 className="page-title">{welcome ? `Welcome, ${first}.` : "You're all caught up"}</h1>
            ) : (
              <h1 className="flex flex-wrap items-baseline gap-x-3 font-bold text-bone">
                <span className="tnum text-[56px] leading-[0.9] tracking-[-0.04em] sm:text-[72px]">{stats.waiting}</span>
                <span className="text-title">track{stats.waiting === 1 ? "" : "s"} waiting</span>
              </h1>
            )}
            <p className="max-w-[46ch] text-[15px] leading-snug text-bone">
              {welcome
                ? "Your link is ready. Share it and the first track lands here."
                : stats.waiting
                  ? waitLine(stats.waiting, stale, oldest)
                  : kept
                    ? `${kept} kept track${kept === 1 ? " is" : "s are"} ready for your set.`
                    : "New tracks will show up here first."}
            </p>
            {stats.waiting > 0 && <p className="text-[13px] text-mute">Senders see Listened once you play past 30 seconds.</p>}
          </div>
          {stats.waiting > 0 && (
            <Link
              href="/dashboard/review?view=queue"
              className="btn-lime min-h-12 w-full shrink-0 px-6 text-[15px]! transition-transform duration-100 active:scale-[0.97] motion-reduce:active:scale-100 sm:w-auto"
            >
              {stats.waiting === 1 ? "Listen now" : "Start with the oldest"}
            </Link>
          )}
        </header>

        {problem && (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3.5">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />
            <p className="min-w-[12rem] flex-1 text-[13px] font-medium leading-snug text-bone">{problem.text}</p>
            {problem.action}
          </div>
        )}

        {/* A desk that has never had a track: sharing the link is the first job, so it comes straight after the welcome. */}
        {fresh && linkSection}

        {weekend && <PlayedOutCard titles={weekend.tracks.map((t) => t.title)} />}

        <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-7">
            {upNext.length > 0 && (
              <section aria-labelledby="next-h" className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="next-h" className="eyebrow">Up next</h2>
                  <Link href="/dashboard/review?view=queue" className="-my-3 inline-flex min-h-11 items-center text-[13px] text-mute underline-offset-4 hover:text-bone hover:underline">
                    {stats.waiting > upNext.length ? <span className="tnum">All {stats.waiting} →</span> : "Open the queue →"}
                  </Link>
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
                    <span className="tnum">{kept}</span> kept track{kept === 1 ? "" : "s"} ready for your set
                  </h2>
                  <p className="text-[12px] text-dim">
                    {nearLimit
                      ? `Your desk is nearly full (${cap.used} of ${cap.limit}). Download them, then delete the ones you're done with to make room.`
                      : "Download them as a crate with a Rekordbox playlist."}
                  </p>
                </div>
                <Link href="/dashboard/prepare" className="btn-ghost btn-sm shrink-0">
                  Prepare
                </Link>
              </section>
            )}
          </div>

          {(!fresh || canSend) && (
            <aside aria-label="Your desk" className="flex min-w-0 flex-col gap-7">
              {deskPanel}
              {/* The link and sending sit in a panel like the desk's (owner, 30 Oct: they felt out of place loose below it). */}
              <div className="panel overflow-hidden">
                {!fresh && (
                  <section aria-labelledby="link-h" className="flex flex-col gap-2.5 px-4 py-4">
                    <h2 id="link-h" className="eyebrow">Your link</h2>
                    <CopyLinkBox link={link} />
                    <p className="text-[12px] text-faint">{linkWhere}</p>
                  </section>
                )}
                {/* On a team desk, Members can't send as the account; in the beta nobody sends from here (switch send_music). */}
                {canSend && <SendMusicCard recent={recentSends} host={APP_URL.replace(/^https?:\/\//, "")} />}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

/** How many cells the capacity strip draws: one per track on the free plan (20), so each cell is 5% on bigger plans. */

/** Waiting this long gets a nudge on the Floor, two days before the 7-day mark the desk aims for. */
const STALE_DAYS = 5;

/** The one sentence under the count: how many have waited too long, and when the oldest came in. */
function waitLine(waiting: number, stale: number, oldest: number | undefined) {
  const arrived = oldest ? ago(oldest) : "";
  if (waiting === 1) return arrived ? `It arrived ${arrived}.` : "It's ready when you are.";
  const late = stale === waiting ? `All ${stale}` : `${stale}`;
  const lateLine = stale > 0 ? `${late} ${stale === 1 ? "has" : "have"} waited over ${STALE_DAYS} days. ` : "";
  return `${lateLine}${arrived ? `The oldest arrived ${arrived}.` : ""}`.trim();
}

/** How long a first listen usually takes, as a readout: "<1h", "5h", "1d", "3d". */
function waitShort(ms: number) {
  const h = ms / 3_600_000;
  if (h < 1) return "<1h";
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
