import { trackUse } from "@/lib/usage";
import { Onboarding, OnboardingSkeleton } from "./Onboarding";
import { showsGettingStarted } from "@/lib/getting-started";
import { Suspense } from "react";
import Link from "next/link";
import { requireUser, viewingAs } from "@/lib/auth";
import { VerifyBanner } from "../VerifyBanner";
import { activeCollectionForView, calloutBlock, capacityForView, collectionsForView, isClosed, isPaused } from "@/lib/desk";
import { now, q } from "@/lib/db";
import { atLeast, canApprove, heldReplies } from "@/lib/account-members";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { localHour, prefsForView } from "@/lib/notify";
import { homeStats } from "@/lib/stats";
import { toPlayer } from "@/lib/player-track";
import { SwitchCollection } from "./SwitchCollection";
import { PlayedOutCard } from "./PlayedOutCard";
import { canMarkPlayedOut, playedOutPrompt } from "@/lib/played-out-prompt";
import { Crate, FloorRow, LABEL, Notice, QUIET, type CrateCover } from "./Crates";
import { LinkRow, PlayAllKept } from "./FloorClient";
import type { IconName } from "@/components/Kit";
import { perDay, periodRange } from "@/lib/analytics";
import { FirstVisitTour } from "../Tour";
import { tourTip } from "@/lib/tour";
import { shareCardTarget } from "../collections/callout-card";

export const metadata = { title: "Floor — FloorTest" };

/** Waiting longer than this is called out on the Waiting crate: the desk aims to decide within 7 days of a track arriving. */
const STALE_DAYS = 7;
const DAY_MS = 86_400_000;
/** From this share of the plan's track limit the Floor says the desk is nearly full. */
const NEARLY_FULL = 0.8;

/** A lime button at the Floor's size ("Review what's waiting" from 1024px; "Mark what I played" uses the same). */
const LIME = "btn-lime min-h-11 rounded-[14px] px-5! text-[14px]! font-semibold";

/** What "Earlier" says for each kind of thing that happened. */
const EARLIER: Record<string, { icon: IconName; says: (sender: string) => string }> = {
  submitted: { icon: "music", says: (s) => `Came in from ${s}` },
  kept: { icon: "heart", says: () => "Kept" },
  played_out: { icon: "wave", says: () => "Played out" },
  downloaded: { icon: "dl", says: () => "Downloaded" },
};

const art = (t: { id: number; art_key: string | null }) => (t.art_key ? `/api/track-art/${t.id}?v=${encodeURIComponent(t.art_key)}` : null);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The Floor, final (Design's option 41, owner 16 Nov). Top to bottom, the same order at every size: the greeting and
 * one line about the week, the receiving link, two crates (what's waiting, what was kept this week), Monday's
 * played-out question on DJ desks, and the week in one row that opens Analytics. Phones show the link after the
 * crates; from 1024px it sits beside the greeting. A new desk gets the link and Getting started instead of crates;
 * a week with nothing new gets the last few things that happened. Nothing here repeats a page of its own.
 */
export default async function TheFloor({ searchParams }: { searchParams: Promise<{ welcome?: string; desk?: string }> }) {
  const user = await requireUser();
  const t = now();
  // Everything below is independent, so it all goes to the database at once.
  const [, sp, prefs, collections, active, cap, waitingNew, keptRows, staleRow, view, held, approver, tourSeen] = await Promise.all([
    trackUse(user.id, "floor"),
    searchParams,
    prefsForView(user.id),
    collectionsForView(user.id),
    activeCollectionForView(user.active_collection_id),
    capacityForView(user.id, user.plan),
    // The Waiting crate's covers: the three newest tracks still waiting.
    q.all<{ id: number; title: string; art_key: string | null }>(
      "SELECT id, title, art_key FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND decision IS NULL ORDER BY created_at DESC, id DESC LIMIT 3",
      user.id,
    ),
    // This week's kept tracks, newest first: the Kept crate's covers and what Play all plays.
    q.all<{ id: number; title: string; artist: string; duration: number | null; peaks: string | null; played_at: number | null; art_key: string | null }>(
      `SELECT id, title, artist, duration, peaks, played_at, art_key FROM tracks
       WHERE user_id = ? AND deleted_at IS NULL AND decision = 'kept' AND decided_at >= ?
       ORDER BY decided_at DESC, id DESC LIMIT 50`,
      user.id,
      t - 7 * DAY_MS,
    ),
    // Tracks past the 7-day mark (the north star: a decision within 7 days of arriving).
    q.get<{ n: number }>("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND decision IS NULL AND created_at < ?", user.id, t - STALE_DAYS * DAY_MS),
    // An admin viewing this desk doesn't get the confirm-your-email banner.
    viewingAs(),
    heldReplies(user),
    canApprove(user),
    // The tour opens by itself once per person (their own row, so each teammate gets it).
    // A failed read counts as seen: the tour waits for the next visit and the Floor still loads.
    q.get<{ t: number | null }>("SELECT tour_seen_at AS t FROM users WHERE id = ?", user.actor_id).catch((e) => {
      // Logged so a failing read is seen; the tour then stays hidden rather than breaking the Floor.
      console.error("[floor] tour read failed", e);
      return { t: 1 };
    }),
  ]);
  const welcome = !!sp.welcome;
  // Never in an admin's view.
  const tourDue = !view && !tourSeen?.t;
  const dj = canMarkPlayedOut(user);
  // Analytics numbers are for the owner and A&R / Admins; members get the week from the Floor's own stats.
  const analyst = atLeast(user.role, "admin");
  const [stats, week, weekend] = await Promise.all([
    homeStats(user.id, prefs.tz),
    // If the Analytics read fails, the Floor still loads with its own week figures instead of the error screen.
    analyst
      ? perDay(user, periodRange("7d", user.tz)).catch((e) => {
          console.error("[floor] perDay failed, using homeStats", e);
          return null;
        })
      : null,
    playedOutPrompt({ ...user, tz: prefs.tz }),
  ]);
  const paused = isPaused(user);
  const member = user.role === "member";
  const link = `${APP_URL}/${user.handle}`;
  const card = shareCardTarget({ isOwner: user.role === "owner", viewingAs: !!view, active, blocked: !!calloutBlock(user, active ?? undefined, cap.full) });
  const kept = collections.reduce((n, c) => n + c.kept, 0);
  const stale = Number(staleRow?.n ?? 0);
  // A desk that has never had a track: sharing the link is the first job, so the link comes first and there are no crates.
  const fresh = welcome || (!stats.waiting && !kept && stats.receivedWeek + stats.receivedPrev === 0 && !stats.listenedSample);

  // The greeting is for the person looking; the public name can be a stage name, so the first name is used.
  const deskFirst = user.first_name?.trim() || user.name.split(/\s+/)[0];
  // On someone else's desk (a teammate), the lines name whose desk and whose link it is.
  const guest = user.actor_id !== user.id;
  const first = guest ? user.actor_name.split(/\s+/)[0] : deskFirst;
  const hour = localHour(prefs.tz);
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  // The week's figures: the same ones on the summary line, the Kept crate and the Your week row.
  const wkIn = week ? week.totals.in : stats.receivedWeek;
  const wkKept = week ? week.totals.kept : stats.keptWeek;
  const wkSenders = week ? week.totals.senders : 0;
  const wkThird = week ? (dj ? week.totals.playedOut : week.totals.downloaded) : 0;
  const thirdWord = dj ? "played out" : "downloaded";
  const summary = fresh
    ? "Your link is ready. Share it and tracks land here."
    : wkIn === 0
      ? "No new tracks this week."
      : `${plural(wkIn, "track")} came in${guest ? ` on ${deskFirst}’s desk` : wkSenders > 0 ? ` from ${plural(wkSenders, "sender")}` : ""} this week.`;

  // A week with nothing new: the last few things that happened, so the Floor isn't bare.
  const earlier =
    !fresh && wkIn === 0
      ? await q.all<{ id: number; type: string; created_at: number; track_id: number; title: string; sender: string }>(
          `SELECT e.id, e.type, e.created_at, e.track_id, t.title, s.name AS sender FROM events e
           JOIN tracks t ON t.id = e.track_id JOIN senders s ON s.id = e.sender_id
           WHERE e.user_id = ? AND t.deleted_at IS NULL AND e.type IN ('submitted', 'kept', 'played_out', 'downloaded')
           ORDER BY e.created_at DESC, e.id DESC LIMIT 3`,
          user.id,
        )
      : [];

  // Notices, one at a time: an unconfirmed email first, then the link not taking tracks, then a desk filling up.
  const verify = !view && !user.email_verified_at;
  const openAlternative = collections.find((c) => !isClosed(c) && c.id !== active?.id);
  // Buttons that change the desk are the owner's and admins', and never shown in an admin's read-only view.
  const canFix = !member && !view;
  const count = `${cap.used.toLocaleString("en-GB")} of ${cap.limit.toLocaleString("en-GB")} tracks`;
  const prepare = (
    <Link href="/dashboard/prepare" className={QUIET}>
      Prepare
    </Link>
  );
  const notice: { text: string; action?: React.ReactNode } | null = verify
    ? null
    : paused
      ? // The Pause your link switch lives on Settings, so the fix points there.
        {
          text: `Your link is paused${user.pause_until ? ` until ${fmtDay(user.pause_until, prefs.tz)}` : ""}.`,
          action: member ? undefined : (
            <Link href="/dashboard/settings" className={QUIET}>
              Open Settings
            </Link>
          ),
        }
      : // No collection is not a problem: the link stays open and tracks land in the Review Queue, unsorted (intake.ts).
        active && isClosed(active)
        ? {
            text: `${active.name} closed on ${fmtDay(active.closes_at!, prefs.tz)}. Nobody can send you music right now.`,
            // Pointing the link elsewhere is for the owner and admins.
            action: !canFix ? undefined : openAlternative ? (
              <SwitchCollection id={openAlternative.id} name={openAlternative.name} />
            ) : (
              <Link href="/dashboard/collections" className={QUIET}>
                New collection
              </Link>
            ),
          }
        : cap.full
          ? // Every track that isn't deleted counts toward the limit, so room comes from clearing tracks you're done with.
            { text: `Your desk is full: ${count}, so your link has stopped taking new ones. Download your kept tracks, then clear them.`, action: prepare }
          : cap.used >= cap.limit * NEARLY_FULL
            ? { text: `Your desk is nearly full: ${count}. Download your kept tracks, then clear them.`, action: prepare }
            : null;

  const waitingCovers: CrateCover[] = waitingNew.map((r) => ({ id: r.id, title: r.title, art: art(r) }));
  const keptCovers: CrateCover[] = keptRows.slice(0, 3).map((r) => ({ id: r.id, title: r.title, art: art(r) }));
  const playAll = keptRows.map((r) => toPlayer({ ...r, peaks: r.peaks ? JSON.parse(r.peaks) : null, played: !!r.played_at }));
  const showKept = wkKept > 0;

  const weekDetail = `${plural(wkIn, "track")} in · ${wkKept} kept${week ? ` · ${wkThird} ${thirdWord}` : ""}`;
  const showWeek = !fresh && wkIn + wkKept + stats.receivedPrev > 0;
  const heldText = approver
    ? `${held.length} repl${held.length === 1 ? "y" : "ies"} waiting for your approval`
    : `${held.length} of your repl${held.length === 1 ? "y is" : "ies are"} waiting for approval`;
  const showStart = showsGettingStarted(user, !!view);
  const start = showStart && (
    <Suspense fallback={<OnboardingSkeleton />}>
      <Onboarding user={user} />
    </Suspense>
  );

  return (
    <>
      {verify && <VerifyBanner email={user.email} />}
      {tourDue && <FirstVisitTour tip={tourTip(user.kind)} />}
      {/* The main column: 20px sides on phones, 920px wide at most and centred. The layout pads the bottom for the player and menu. */}
      <div className="relative px-5 py-4 sm:py-7 md:px-8">
        <div className="relative mx-auto flex w-full min-w-0 max-w-[920px] flex-col gap-4 lg:gap-5">
          {sp.desk === "ended" && (
            <p role="alert" className="rounded-[13px] border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-bone">
              You don&apos;t have access to that team&apos;s desk any more, so nothing was changed. This is your own desk.
            </p>
          )}
          {notice && <Notice action={notice.action}>{notice.text}</Notice>}

          {/* In the page's order (and the tab order) the link follows the greeting; phones show it after the crates. A new desk
              has no crates, so the link row is full width under the greeting at every size (option 41, new desk). */}
          <div className={fresh ? "contents" : "contents lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-end lg:gap-6"}>
            <header className="flex min-w-0 flex-col gap-1.5 max-lg:order-1">
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em] text-bone lg:text-[34px]">{fresh ? `Welcome, ${first}` : `${greeting}, ${first}`}</h1>
              <p className="max-w-[46ch] text-[14px] leading-snug text-mute tnum lg:text-[15px]">{summary}</p>
            </header>
            <div id="your-link" className={`flex min-w-0 scroll-mt-20 flex-col gap-1.5 ${fresh ? "max-lg:order-1" : "max-lg:order-3"}`}>
              <LinkRow link={link} card={card} owner={guest ? deskFirst : undefined} />
              {fresh && (
                <p className="text-[12px] text-mute">
                  {notice ? "Not taking uploads right now" : active ? `Sends tracks to “${active.name}”${active.closes_at ? `, open until ${fmtDay(active.closes_at, prefs.tz)}` : ""}` : "Sends tracks to your Review Queue"}
                </p>
              )}
            </div>
          </div>

          {!fresh && (
            <div className="grid grid-cols-2 gap-3 max-lg:order-2 lg:gap-5">
              <Crate
                label="Waiting"
                covers={waitingCovers}
                hot={stats.waiting > 0}
                wide={!showKept}
                n={stats.waiting}
                lines={
                  stats.waiting > 0 ? (
                    <>
                      <p>waiting</p>
                      {stale > 0 && (
                        <p className="text-[#d98a2b]">
                          {stale}
                          <span className="hidden lg:inline">{stale === 1 ? " has waited" : " have waited"}</span> over {STALE_DAYS} days
                        </p>
                      )}
                    </>
                  ) : (
                    <p>nothing waiting</p>
                  )
                }
                actions={
                  stats.waiting > 0 ? (
                    // As drawn in option 41: quiet on phones, lime from 1024px. One is shown at a time.
                    <>
                      <Link href="/dashboard/review?view=queue" className={`${QUIET} lg:hidden`}>
                        Review <span aria-hidden>→</span>
                      </Link>
                      <Link href="/dashboard/review?view=queue" className={`${LIME} max-lg:hidden`}>
                        Review what&apos;s waiting <span aria-hidden>→</span>
                      </Link>
                    </>
                  ) : (
                    <a href="#your-link" className={QUIET}>
                      Share your link
                    </a>
                  )
                }
              />
              {showKept && (
                <Crate
                  label="Kept this week"
                  covers={keptCovers}
                  n={wkKept}
                  lines={
                    <p>
                      kept this week{wkThird > 0 ? ` · ${wkThird} ${thirdWord}` : ""}
                    </p>
                  }
                  actions={
                    <>
                      {playAll.length > 0 && <PlayAllKept tracks={playAll} />}
                      <Link href="/dashboard/review?view=list&s=kept" className={QUIET} aria-label="Open your kept tracks">
                        Open
                      </Link>
                    </>
                  }
                />
              )}
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-4 max-lg:order-4 lg:gap-5">
            {/* A new desk: Getting started comes straight after the link. */}
            {fresh && start}

            {weekend && <PlayedOutCard titles={weekend.tracks.map((x) => x.title)} readOnly={!!view} />}

            {held.length > 0 && (
              <section aria-label="Your desk" className="flex flex-col">
                <p className={LABEL}>Needs you</p>
                <FloorRow icon="reply" title={heldText} detail="Open Team to read and approve" href="/dashboard/settings/team" />
              </section>
            )}

            {showWeek && (
              <div className="flex flex-col">
                <p className={LABEL}>This week</p>
                <section aria-label="Your week">
                  <FloorRow icon="analytics" title="Your week" detail={weekDetail} href={analyst ? "/dashboard/analytics?p=7d" : undefined} />
                </section>
              </div>
            )}

            {earlier.length > 0 && (
              <section aria-labelledby="earlier-h" className="flex flex-col">
                <h2 id="earlier-h" className={LABEL}>
                  Earlier
                </h2>
                {earlier.map((e) => (
                  <FloorRow
                    key={e.id}
                    icon={EARLIER[e.type].icon}
                    title={e.title}
                    detail={EARLIER[e.type].says(e.sender)}
                    when={fmtDay(Number(e.created_at), prefs.tz)}
                    href={`/dashboard/review?view=queue&s=all&t=${e.track_id}`}
                  />
                ))}
              </section>
            )}

            {/* On a desk that already has tracks, Getting started sits last: the crates come first. Only the account
                owner on their own desk sees it: not team members, not an admin in View as. */}
            {!fresh && start}
          </div>
        </div>
      </div>
    </>
  );
}
