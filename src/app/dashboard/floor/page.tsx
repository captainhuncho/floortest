import { trackUse } from "@/lib/usage";
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
import { planOf } from "@/lib/plan-store";
import { SwitchCollection } from "./SwitchCollection";
import { SendMusicCard } from "./SendMusicCard";
import { UpNext } from "./UpNext";
import { UpNextHero } from "./UpNextHero";
import { PlayedOutCard } from "./PlayedOutCard";
import { playedOutPrompt } from "@/lib/played-out-prompt";
import { Chip, DeskStrip, FloorIcon, IconBox, InfoRow, Legend, StatTile } from "./FloorBits";
import { LinkRow, WeekChart } from "./FloorClient";

export const metadata = { title: "Floor — FloorTest" };

/**
 * The Floor answers "what needs my attention?" before anything else (owner, 30 Oct: the elevated Floor): four tiles
 * (waiting, kept this week, first listen, decided), the oldest waiting track big with its details and the one lime
 * button, the newest arrivals under it, anything wrong with the link, and on the desk side how full the desk is, its
 * links and the week's chart. From 1280px the two sit side by side. Nothing here repeats a page of its own.
 */
export default async function TheFloor({ searchParams }: { searchParams: Promise<{ welcome?: string; desk?: string }> }) {
  const user = await requireUser();
  // Everything below is independent, so it all goes to the database at once.
  const [, sp, prefs, collections, active, cap, upNextRows, oldestTrack, recentSends, staleRow, view, plan] = await Promise.all([
    trackUse(user.id, "floor"),
    searchParams,
    prefsForView(user.id),
    collectionsForView(user.id),
    activeCollectionForView(user.active_collection_id),
    capacityForView(user.id, user.plan),
    q.all<{ id: number; title: string; artist: string; genre: string; duration: number | null; peaks: string | null; played_at: number | null; created_at: number; sender: string }>(`SELECT t.id, t.title, t.artist, t.genre, t.duration, t.peaks, t.played_at, t.created_at, s.name AS sender FROM tracks t
         JOIN senders s ON s.id = t.sender_id WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.decision IS NULL
         ORDER BY t.created_at DESC, t.id DESC LIMIT 6`, user.id),
    // The longest-waiting track: the Floor's big card, where the queue starts (it plays oldest first).
    q.get<{ id: number; title: string; artist: string; genre: string; bpm: number | null; duration: number | null; peaks: string | null; played_at: number | null; created_at: number; sender: string; collection: string | null }>(
      `SELECT t.id, t.title, t.artist, t.genre, t.bpm, t.duration, t.peaks, t.played_at, t.created_at, s.name AS sender, c.name AS collection FROM tracks t
         JOIN senders s ON s.id = t.sender_id LEFT JOIN collections c ON c.id = t.collection_id
         WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.decision IS NULL ORDER BY t.created_at ASC, t.id ASC LIMIT 1`,
      user.id,
    ),
    // FloorTest users you've sent music to from your account, most recent first.
    q.all<{ handle: string; name: string }>(
      `SELECT u.handle, u.name FROM senders s JOIN users u ON u.id = s.user_id
       WHERE s.account_id = ? AND u.suspended_at IS NULL
       GROUP BY u.id, u.handle, u.name ORDER BY MAX(s.created_at) DESC LIMIT 6`,
      user.id,
    ),
    // Tracks close to the 7-day mark (the north star: a decision within 7 days of arriving).
    q.get<{ n: number }>("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND decision IS NULL AND created_at < ?", user.id, now() - STALE_DAYS * 86_400_000),
    // An admin viewing this desk doesn't get the confirm-your-email banner.
    viewingAs(),
    planOf(user.plan),
  ]);
  const welcome = !!sp.welcome;
  const stats = await homeStats(user.id, prefs.tz);
  const weekend = await playedOutPrompt({ ...user, tz: prefs.tz });
  const paused = isPaused(user);
  const link = `${APP_URL}/${user.handle}`;
  // Each row's age is worked out here, once, so the server and the browser agree on it.
  const upNext = upNextRows.map((t) => ({ ...t, peaks: t.peaks ? JSON.parse(t.peaks) : null, played: !!t.played_at, age: ago(Number(t.created_at)) }));
  const oldest = oldestTrack ? { ...oldestTrack, peaks: oldestTrack.peaks ? JSON.parse(oldestTrack.peaks) : null, played: !!oldestTrack.played_at } : null;
  // Under the big card: the newest arrivals, without the one already shown big.
  const justIn = upNext.filter((t) => t.id !== oldest?.id);
  const kept = collections.reduce((n, c) => n + c.kept, 0);
  const stale = Number(staleRow?.n ?? 0);
  // A desk that has never had a track: sharing the link is the first job, so the link comes first.
  const fresh = welcome || (!stats.waiting && !kept && stats.receivedWeek + stats.receivedPrev === 0 && !stats.listenedSample);
  // First visit only: a greeting by first name; the public name can be a stage name or just the username.
  const first = user.first_name?.trim() || user.name.split(/\s+/)[0];
  const hour = localHour(prefs.tz);
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: prefs.tz, weekday: "long", day: "numeric", month: "long" }).format(now());

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

  // The four tiles. A figure with no data yet says so rather than showing a zero that means nothing.
  const keptDelta = stats.keptWeek - stats.keptPrev;
  const tiles = (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      <StatTile icon="inbox" label="Waiting" value={String(stats.waiting)} chip={stale > 0 ? <Chip tone="warn">{stale} over {STALE_DAYS} days</Chip> : undefined} />
      <StatTile
        icon="heart"
        label="Kept this week"
        value={String(stats.keptWeek)}
        chip={keptDelta > 0 ? <Chip tone="up"><FloorIcon name="up" className="size-3" />{keptDelta}</Chip> : keptDelta < 0 ? <Chip>−{Math.abs(keptDelta)}</Chip> : undefined}
      />
      <StatTile icon="head" label="First listen" value={stats.medianListenMs !== null ? waitShort(stats.medianListenMs) : "–"} chip={<Chip>{stats.medianListenMs !== null ? "usual" : "no plays yet"}</Chip>} />
      <StatTile icon="check" label="Decided" value={stats.decisionRate !== null ? `${stats.decisionRate}%` : "–"} chip={<Chip>30 days</Chip>} />
    </div>
  );

  // Your desk: what needs you (approvals, lime) and seats as links; then how full it is, collections, contacts and plan.
  const teamDesk = (await teamsOn(user.id)) && atLeast(user.role, "admin");
  const [seats, used, held, approver, contacts] = await Promise.all([
    teamDesk ? seatsFor(user.id) : 0,
    teamDesk ? seatsUsed(user.id) : 0,
    heldReplies(user),
    canApprove(user),
    q.get<{ n: number }>("SELECT COUNT(*) AS n FROM senders WHERE user_id = ?", user.id),
  ]);
  const contactCount = Number(contacts?.n ?? 0);
  const nearLimit = cap.used >= cap.limit * 0.8;
  // Near the limit with kept tracks, the way out is downloading and clearing them (Prepare), before any upgrade.
  const capHref = nearLimit && kept > 0 ? "/dashboard/prepare" : "/dashboard/account";
  const passed = Math.max(0, cap.used - stats.waiting - kept);
  const free = Math.max(0, cap.limit - cap.used);
  const deskLinks: { key: string; href: string; text: string; urgent?: boolean }[] = [
    ...(held.length
      ? [{ key: "held", href: "/dashboard/settings/team", urgent: true, text: approver ? `${held.length} repl${held.length === 1 ? "y" : "ies"} waiting for your approval` : `${held.length} of your repl${held.length === 1 ? "y is" : "ies are"} waiting for approval` }]
      : []),
    ...(teamDesk && seats > 1 ? [{ key: "seats", href: "/dashboard/settings/team", text: `${used} of ${seats} seats` }] : []),
  ];

  // Where the link sends, as the label over it (owner, 30 Oct mock: "Your link · sends to “Friday residency”").
  const linkWhere = problem
    ? "Your link · not taking uploads right now"
    : active
      ? `Your link · sends to “${active.name}”${active.closes_at ? `, open until ${fmtDay(active.closes_at)}` : ""}`
      : "Your link · sends to your Review Queue";

  // A new desk's link, on its own above the checklist.
  const linkSection = (
    <section aria-labelledby="link-h" className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-card p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
      <h2 id="link-h" className="text-[15px] font-semibold text-bone">Your link</h2>
      <p className="text-[11.5px] text-mute">{linkWhere.replace(/^Your link · sends to/, "Sends tracks to").replace(/^Your link · n/, "N")}</p>
      <LinkRow link={link} />
    </section>
  );

  // The desk card (the mock's "Your desk"): how full it is as ticks, what needs you, its figures and the link.
  const deskCard = !fresh && (
    <section aria-labelledby="desk-h" className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="desk-h" className="text-[15px] font-semibold text-bone">Your desk</h2>
        <Link href={capHref} className={`text-[12px] tnum underline-offset-4 hover:underline ${nearLimit ? "font-semibold text-lime" : "text-mute hover:text-bone"}`}>
          <strong className={`text-[16px] font-semibold ${nearLimit ? "" : "text-bone"}`}>{cap.used.toLocaleString("en-GB")}</strong> of {cap.limit.toLocaleString("en-GB")} tracks
        </Link>
      </div>
      <DeskStrip waiting={stats.waiting} kept={kept} passed={passed} limit={cap.limit} />
      <Legend
        items={[
          { label: `Waiting ${stats.waiting}`, tone: "bg-lime" },
          { label: `Kept ${kept}`, tone: "bg-[color-mix(in_oklab,var(--color-lime)_45%,var(--color-line-2))]" },
          ...(passed ? [{ label: `Not for me ${passed}`, tone: "bg-mute/55" }] : []),
          { label: `Free ${free}`, tone: "bg-line-2" },
        ]}
      />
      {deskLinks.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {deskLinks.map((d) => (
            <li key={d.key}>
              <Link
                href={d.href}
                className={`group flex min-h-11 items-center gap-2 rounded-[11px] border px-2.5 text-[12.5px] ${d.urgent ? "border-lime/40 font-semibold text-lime" : "border-line bg-well text-mute hover:text-bone"}`}
              >
                {d.urgent && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lime" />}
                <span className="min-w-0 flex-1">{d.text}</span>
                <FloorIcon name="chev" className="size-4 text-faint transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-3 border-y border-dashed border-line-2 py-1.5 text-center">
        <Link href="/dashboard/collections" className="flex min-h-11 flex-col items-center justify-center rounded-lg hover:bg-well">
          <span className="text-[11.5px] text-mute">Collections</span>
          <span className="text-[14px] font-semibold text-bone tnum">{collections.length}</span>
        </Link>
        <Link href="/dashboard/contacts" className="flex min-h-11 flex-col items-center justify-center rounded-lg hover:bg-well">
          <span className="text-[11.5px] text-mute">Contacts</span>
          <span className="text-[14px] font-semibold text-bone tnum">{contactCount}</span>
        </Link>
        <Link href="/dashboard/plans" className="flex min-h-11 flex-col items-center justify-center rounded-lg hover:bg-well">
          <span className="text-[11.5px] text-mute">Plan</span>
          <span className="text-[14px] font-semibold text-bone">{plan.name}</span>
        </Link>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 id="link-h" className="text-[11.5px] text-mute">{linkWhere}</h3>
        <LinkRow link={link} />
      </div>
    </section>
  );

  // The week: a Received / Kept / Listened switch over the last seven days, the totals in the chip.
  const week = stats.daily.slice(-7);
  const receivedDelta = stats.receivedWeek - stats.receivedPrev;
  const weekCard = !fresh && stats.receivedWeek + stats.receivedPrev + stats.keptWeek > 0 && (
    <section aria-labelledby="week-h" className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="week-h" className="text-[15px] font-semibold text-bone">This week</h2>
        <Chip tone={receivedDelta > 0 ? "up" : "flat"}>
          {stats.receivedWeek} received · {receivedDelta === 0 ? "same as last week" : receivedDelta > 0 ? `${receivedDelta} more` : `${-receivedDelta} fewer`}
        </Chip>
      </div>
      <WeekChart days={week} />
    </section>
  );

  return (
    <>
    {!view && !user.email_verified_at && <VerifyBanner email={user.email} />}
    {/*
      The elevated Floor (owner, 30 Oct). One column on phones and tablets; from 1280px the work on the left (Up next,
      setting up, what's ready for a set) and the desk on the right (how full it is, the link, the week, sending).
      What needs you stays on top at every width: the tiles, the one lime button, anything wrong.
    */}
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 sm:gap-5 xl:max-w-6xl">
        {sp.desk === "ended" && (
          <p role="alert" className="rounded-lg border border-danger/40 px-4 py-3 text-sm">
            You don&apos;t have access to that team&apos;s desk any more, so nothing was changed. This is your own desk.
          </p>
        )}
        <header className="flex min-w-0 flex-col gap-1">
          <p className="text-[12px] text-mute">{today}</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone sm:text-[26px]">
            {welcome ? `Welcome, ${first}.` : `${greeting}, ${first}`}
          </h1>
          {welcome && <p className="max-w-[46ch] text-[14px] leading-snug text-mute">Your link is ready. Share it and the first track lands here.</p>}
          {!welcome && !stats.waiting && (
            <p className="max-w-[46ch] text-[14px] leading-snug text-mute">
              {kept ? `You're all caught up. ${kept} kept track${kept === 1 ? " is" : "s are"} ready for your set.` : "You're all caught up. New tracks will show up here first."}
            </p>
          )}
        </header>

        {problem && (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[14px] border border-danger/40 bg-danger/10 px-3.5 py-3">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />
            <p className="min-w-[12rem] flex-1 text-[13px] font-medium leading-snug text-bone">{problem.text}</p>
            {problem.action}
          </div>
        )}

        {/* A desk that has never had a track: sharing the link is the first job, so it comes straight after the welcome. */}
        {fresh && linkSection}

        {!fresh && tiles}

        {weekend && <PlayedOutCard titles={weekend.tracks.map((t) => t.title)} />}

        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            {oldest && (
              <section aria-labelledby="next-h" className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <IconBox name="wave" small />
                    <h2 id="next-h" className="text-[15px] font-semibold text-bone">Up next</h2>
                  </div>
                  <Link href="/dashboard/review?view=queue" className="btn-ghost btn-sm gap-1">
                    {stats.waiting > 1 ? <span className="tnum">All {stats.waiting}</span> : "Open the queue"}
                    <FloorIcon name="chev" className="size-3.5" />
                  </Link>
                </div>
                <div className="min-w-0">
                  <p className="text-[11.5px] text-mute">{stats.waiting > 1 ? "Oldest waiting" : "Waiting"}</p>
                  <p className="mt-0.5 truncate text-[20px] font-semibold leading-tight tracking-[-0.03em] text-bone">{oldest.title}</p>
                  <p className="truncate text-[13px] text-mute">{oldest.artist}</p>
                </div>
                <UpNextHero track={oldest} queue={upNext} />
                <dl className="flex flex-col gap-1.5">
                  {(oldest.genre || oldest.bpm) && (
                    <InfoRow icon="tag" label="Genre">
                      {[oldest.genre, oldest.bpm ? `${Math.round(oldest.bpm)} BPM` : null].filter(Boolean).join(" · ")}
                    </InfoRow>
                  )}
                  {oldest.sender !== oldest.artist && <InfoRow icon="user" label="Sender">{oldest.sender}</InfoRow>}
                  <InfoRow icon="folder" label="Collection">{oldest.collection ?? "Review Queue"}</InfoRow>
                  <InfoRow icon="clock" label="Arrived">
                    {now() - Number(oldest.created_at) > STALE_DAYS * 86_400_000 && <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-[#e89a3c] align-middle" />}
                    {ago(Number(oldest.created_at))}
                  </InfoRow>
                </dl>
                <Link
                  href="/dashboard/review?view=queue"
                  className="btn-lime min-h-12 w-full px-6 text-[15px]! transition-transform duration-100 active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  {stats.waiting === 1 ? "Listen now" : "Start with the oldest"}
                </Link>
                <p className="text-center text-[11.5px] text-faint">Senders see Listened once you play past 30 seconds.</p>
                {justIn.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-dashed border-line-2 pt-3">
                    <h3 className="text-[11.5px] text-mute">Just in</h3>
                    <UpNext items={justIn} />
                  </div>
                )}
              </section>
            )}

            {/* The checklist helps a new desk; on a busy one the queue comes first. */}
            {/* Setting up the account is for the owner and admins; members skip the checklist. */}
            {user.role !== "member" && <Onboarding user={user} />}

            {kept > 0 && (
              <section aria-labelledby="set-h" className="flex items-center justify-between gap-4 rounded-[18px] border border-line bg-card p-3 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
                <div className="flex min-w-0 items-center gap-2.5">
                  <IconBox name="heart" />
                  <div className="min-w-0">
                    <h2 id="set-h" className="text-[14px] font-semibold text-bone">
                      <span className="tnum">{kept}</span> kept track{kept === 1 ? "" : "s"} ready for your set
                    </h2>
                    <p className="text-[12px] text-faint">
                      {nearLimit
                        ? `Your desk is nearly full (${cap.used} of ${cap.limit}). Download them, then delete the ones you're done with to make room.`
                        : "Download them as a crate with a Rekordbox playlist."}
                    </p>
                  </div>
                </div>
                <Link href="/dashboard/prepare" className="btn-ghost btn-sm shrink-0">
                  Prepare
                </Link>
              </section>
            )}
          </div>

          {(!fresh || canSend) && (
            <aside aria-label="Your desk" className="flex min-w-0 flex-col gap-4 sm:gap-5">
              {deskCard}
              {weekCard}
              {/* On a team desk, Members can't send as the account; in the beta nobody sends from here (switch send_music). */}
              {canSend && (
                <div className="overflow-hidden rounded-[18px] border border-line bg-card shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
                  <SendMusicCard recent={recentSends} host={APP_URL.replace(/^https?:\/\//, "")} />
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

/** Waiting this long gets a nudge on the Floor, two days before the 7-day mark the desk aims for. */
const STALE_DAYS = 5;

/** How long a first listen usually takes, as a readout: "<1h", "5h", "1d", "3d". */
function waitShort(ms: number) {
  const h = ms / 3_600_000;
  if (h < 1) return "<1h";
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
