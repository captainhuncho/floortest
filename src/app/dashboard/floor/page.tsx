import { Onboarding } from "./Onboarding";
import { recentAudit } from "@/lib/audit";
import { AccountLog } from "../AccountLog";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { activeCollection, capacity, collectionsFor, isClosed, isPaused } from "@/lib/core";
import { q } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { localHour, prefsFor } from "@/lib/notify";
import { genresFor } from "@/lib/plans";
import { fmtDuration, genreMix, homeStats } from "@/lib/stats";
import { DailyColumns, GenreBars } from "./HomeCharts";
import { SwitchCollection } from "./SwitchCollection";
import { CopyLinkBox } from "./CopyLinkBox";
import { SendMusicCard } from "./SendMusicCard";
import { UpNext } from "./UpNext";

export const metadata = { title: "The Floor — FloorTest" };

const DAY = 86_400_000;

function Card({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#2c2e29] bg-[#1e1f1b] p-4 ${className}`} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[1px] text-[#a3a69b]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Figma "kpi-card". */
function Stat({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-[#2c2e29] bg-[#1e1f1b] p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-[1px] text-[#a3a69b]">{label}</p>
      <p className="text-[30px] font-bold leading-none text-[#f1f1eb] tnum">{value}</p>
      {note && <p className="text-[10px] text-[#6b6e65]">{note}</p>}
    </div>
  );
}

const delta = (now: number, prev: number) => {
  const d = now - prev;
  if (d === 0) return "Same as last week";
  return (
    <>
      <span className="text-white">
        {d > 0 ? "↑" : "↓"} {Math.abs(d)}
      </span>{" "}
      vs last week
    </>
  );
};

// Figma card action link (Manage, Filter, Start reviewing).
const act = "text-[11px] font-bold text-[#f1f1eb] hover:text-lime";

export default async function TheFloor({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const welcome = !!(await searchParams).welcome;
  const prefs = await prefsFor(user.id);
  const stats = await homeStats(user.id, prefs.tz);
  const mix = await genreMix(user.id);
  const collections = await collectionsFor(user.id);
  const active = await activeCollection(user);
  const cap = await capacity(user);
  const paused = isPaused(user);
  const link = `${APP_URL}/${user.handle}`;
  const hour = localHour(prefs.tz);
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = user.name.split(/\s+/)[0];

  const upNext = (
    (await q.all<{ id: number; title: string; artist: string; genre: string; duration: number | null; peaks: string | null; played_at: number | null; sender: string }>(`SELECT t.id, t.title, t.artist, t.genre, t.duration, t.peaks, t.played_at, s.name AS sender FROM tracks t
         JOIN senders s ON s.id = t.sender_id WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.decision IS NULL
         ORDER BY t.created_at LIMIT 4`, user.id))
  ).map((t) => ({ ...t, peaks: t.peaks ? JSON.parse(t.peaks) : null, played: !!t.played_at }));

  const mine = await recentAudit(user.id, 6);

  // FloorTest users you've sent music to from your account, most recent first.
  const recentSends = await q.all<{ handle: string; name: string }>(
    `SELECT u.handle, u.name FROM senders s JOIN users u ON u.id = s.user_id
     WHERE s.account_id = ? AND u.suspended_at IS NULL
     GROUP BY u.id, u.handle, u.name ORDER BY MAX(s.created_at) DESC LIMIT 6`,
    user.id,
  );

  const contacts = (await q.all<{ id: number; name: string; verified_at: number | null; sent: number; kept: number }>(`SELECT s.id, s.name, s.verified_at, COUNT(t.id) AS sent, COUNT(CASE WHEN t.decision = 'kept' THEN 1 END) AS kept
       FROM senders s JOIN tracks t ON t.sender_id = s.id WHERE s.user_id = ?
       GROUP BY s.id ORDER BY kept DESC, sent DESC, MAX(t.created_at) DESC LIMIT 4`, user.id));

  // Link health: the one thing to fix, if anything.
  const openAlternative = collections.find((c) => !isClosed(c) && c.id !== active?.id);
  let status: { tone: "ok" | "warn"; text: string; action?: React.ReactNode };
  if (paused)
    status = {
      tone: "warn",
      text: `Submissions are paused${user.pause_until ? ` until ${fmtDay(user.pause_until)}` : ""}. Switch “Taking submissions” back on in the sidebar when you're ready.`,
    };
  else if (!active || isClosed(active))
    status = {
      tone: "warn",
      text: active ? `Your link sends tracks to “${active.name}”, which closed on ${fmtDay(active.closes_at!)}. Nobody can send you music right now.` : "Your link isn't sending tracks anywhere.",
      action: openAlternative ? (
        <SwitchCollection id={openAlternative.id} name={openAlternative.name} />
      ) : (
        <Link href="/dashboard/collections" className="btn-lime btn-sm">
          Open a new callout
        </Link>
      ),
    };
  else if (cap.full)
    status = {
      tone: "warn",
      text: "Your desk is full, so your link has stopped taking uploads.",
      action: (
        <Link href="/dashboard/settings#plan-h" className="btn-lime btn-sm">
          See plans
        </Link>
      ),
    };
  else
    status = {
      tone: "ok",
      text: `Your link is open and sending tracks to “${active.name}”${active.closes_at ? `, closing ${fmtDay(active.closes_at)}` : ""}.`,
      action: (
        <a href={`/${user.handle}`} target="_blank" className="shrink-0 rounded-lg border border-[#2c2e29] bg-[#1a1c18] px-3.5 py-[7px] text-[11px] font-bold text-[#f1f1eb]">
          Preview link
        </a>
      ),
    };

  const daysLeft = active?.closes_at && !isClosed(active) ? Math.ceil((active.closes_at - Date.now()) / DAY) : null;

  return (
    <div className="space-y-4 px-4 py-4 font-[family-name:var(--font-stage-mono)] sm:px-8 sm:py-6">
      <header className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[1px] text-[#6b6e65]">{welcome ? "Welcome to FloorTest" : new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: prefs.tz })}</p>
        <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-1px] text-[#f1f1eb]">
          {greeting}, {first}.
        </h1>
        <p className="text-[13px] text-[#a3a69b]">
          {stats.waiting ? `${stats.waiting} track${stats.waiting === 1 ? " is" : "s are"} waiting for you.` : "Nothing is waiting. You're all caught up."}
        </p>
      </header>

      <Onboarding user={user} />

      {/* Figma "Submission Status Banner" */}
      <div
        role="status"
        className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3.5 ${status.tone === "ok" ? "border-[#2c2e29] bg-[#1e1f1b]" : "border-danger/40 bg-danger/10"}`}
      >
        {status.tone === "ok" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/icons/green-dot.svg" alt="" className="size-2 shrink-0" />
        ) : (
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />
        )}
        <p className="min-w-0 flex-1 text-[13px] font-medium text-[#a3a69b]">{status.text}</p>
        {status.action}
      </div>


      <SendMusicCard recent={recentSends} host={APP_URL.replace(/^https?:\/\//, "")} />

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Stat label="Received this week" value={String(stats.receivedWeek)} note={delta(stats.receivedWeek, stats.receivedPrev)} />
        <Stat label="Waiting for decision" value={String(stats.waiting)} note={stats.decisionRate !== null ? `${stats.decisionRate}% in last 30 days` : undefined} />
        <Stat label="Kept this week" value={String(stats.keptWeek)} note={delta(stats.keptWeek, stats.keptPrev)} />
        <Stat
          label="Time to first listen"
          value={stats.medianListenMs !== null ? fmtDuration(stats.medianListenMs) : "—"}
          note={stats.listenedSample ? `last 30 days (${stats.listenedSample} tracks)` : "Listen to a track to start this"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title="Up next"
          className="xl:col-span-2"
          action={
            upNext.length > 0 && (
              <Link href="/dashboard?view=queue" className="text-xs font-bold text-white hover:text-lime">
                Start reviewing →
              </Link>
            )
          }
        >
          {upNext.length ? <UpNext items={upNext} /> : <p className="text-xs text-[#6b6e65]">Nothing waiting. New tracks will show up here first.</p>}
        </Card>

        <Card title="Current callout" action={<Link href="/dashboard/collections" className={act}>Manage</Link>}>
          {active ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <p className="break-words text-[30px] font-bold leading-tight text-[#f1f1eb]">{active.name}</p>
                <p className="text-xs text-[#6b6e65]">
                  {isClosed(active)
                    ? `Closed ${fmtDay(active.closes_at!)}`
                    : daysLeft !== null
                      ? `Closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                      : "Open, no closing date"}
                  {" · "}
                  {collections.find((c) => c.id === active.id)?.count ?? 0} tracks
                </p>
              </div>
              {(genresFor(active).custom || (active.bpm_min && active.bpm_max)) && (
                <div className="flex flex-wrap gap-1.5">
                  {[...(genresFor(active).custom ? genresFor(active).list : []), ...(active.bpm_min && active.bpm_max ? [`${active.bpm_min}–${active.bpm_max} BPM`] : [])].map((g) => (
                    <span key={g} className="rounded-md bg-[#1a1c18] px-2.5 py-1 text-[11px] text-[#a3a69b]">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              <CopyLinkBox link={link} />
            </div>
          ) : (
            <p className="text-xs text-[#6b6e65]">No collection selected.</p>
          )}
        </Card>

        <Card title="Tracks received, last 14 days" className="xl:col-span-2">
          <DailyColumns data={stats.daily} />
        </Card>

        <Card title="Genres, last 30 days" action={<Link href="/dashboard?view=list" className={act}>Filter</Link>}>
          <GenreBars data={mix} />
        </Card>

        <Card
          title="Your recent activity"
          className="xl:col-span-2"
          action={<Link href="/dashboard/activity" className={act}>Full log</Link>}
        >
          <AccountLog rows={mine} />
        </Card>

        <Card title="Top contacts" action={<Link href="/dashboard/contacts?sort=kept" className={act}>All contacts</Link>}>
          {contacts.length ? (
            <ul className="divide-y divide-line">
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/contacts/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-lime">
                    <span className="min-w-0 truncate">
                      {c.name}
                      {c.verified_at ? <span className="sr-only"> (verified)</span> : null}
                    </span>
                    <span className="shrink-0 text-sm text-mute tnum">
                      {c.kept} kept · {c.sent} sent
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-mute">Contacts appear after the first upload.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
