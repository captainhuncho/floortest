import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { activeCollection, capacity, collectionsFor, isClosed, isPaused } from "@/lib/core";
import { db, type EventRow } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { localHour, prefsFor } from "@/lib/notify";
import { genresFor } from "@/lib/plans";
import { fmtDuration, genreMix, homeStats } from "@/lib/stats";
import { History } from "../History";
import { DailyColumns, GenreBars } from "./HomeCharts";
import { SwitchCollection } from "./SwitchCollection";
import { UpNext } from "./UpNext";

export const metadata = { title: "The Floor — FloorTest" };

const DAY = 86_400_000;

function Card({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`} aria-label={title}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-mute">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tnum">{value}</p>
      {note && <p className="mt-1 text-sm text-mute">{note}</p>}
    </div>
  );
}

const delta = (now: number, prev: number) => {
  const d = now - prev;
  return d === 0 ? "Same as last week" : `${d > 0 ? "↑" : "↓"} ${Math.abs(d)} vs last week`;
};

export default async function TheFloor({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const welcome = !!(await searchParams).welcome;
  const prefs = prefsFor(user.id);
  const stats = homeStats(user.id, prefs.tz);
  const mix = genreMix(user.id);
  const collections = collectionsFor(user.id);
  const active = activeCollection(user);
  const cap = capacity(user);
  const paused = isPaused(user);
  const link = `${APP_URL}/${user.handle}`;
  const hour = localHour(prefs.tz);
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = user.name.split(/\s+/)[0];

  const upNext = (
    db()
      .prepare(
        `SELECT t.id, t.title, t.artist, t.genre, t.duration, t.peaks, t.played_at, s.name AS sender FROM tracks t
         JOIN senders s ON s.id = t.sender_id WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.decision IS NULL
         ORDER BY t.created_at LIMIT 4`,
      )
      .all(user.id) as { id: number; title: string; artist: string; genre: string; duration: number | null; peaks: string | null; played_at: number | null; sender: string }[]
  ).map((t) => ({ ...t, peaks: t.peaks ? JSON.parse(t.peaks) : null, played: !!t.played_at }));

  const events = db()
    .prepare(
      `SELECT e.*, t.title AS track_title, s.name AS sender_name FROM events e
       LEFT JOIN tracks t ON t.id = e.track_id JOIN senders s ON s.id = e.sender_id
       WHERE e.user_id = ? AND e.type != 'note' ORDER BY e.created_at DESC LIMIT 6`,
    )
    .all(user.id) as (EventRow & { track_title: string | null; sender_name: string })[];

  const contacts = db()
    .prepare(
      `SELECT s.id, s.name, s.verified_at, COUNT(t.id) AS sent, COUNT(CASE WHEN t.decision = 'kept' THEN 1 END) AS kept
       FROM senders s JOIN tracks t ON t.sender_id = s.id WHERE s.user_id = ?
       GROUP BY s.id ORDER BY kept DESC, sent DESC, MAX(t.created_at) DESC LIMIT 4`,
    )
    .all(user.id) as { id: number; name: string; verified_at: number | null; sent: number; kept: number }[];

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
        <a href={`/${user.handle}`} target="_blank" className="btn-ghost btn-sm">
          Preview link
        </a>
      ),
    };

  const anyDecision = !!db().prepare("SELECT 1 FROM tracks WHERE user_id = ? AND decision IS NOT NULL LIMIT 1").get(user.id);
  const anySet = !!db().prepare("SELECT 1 FROM tracks WHERE user_id = ? AND decision = 'kept' AND downloaded_at IS NOT NULL LIMIT 1").get(user.id);
  const anyTrack = !!db().prepare("SELECT 1 FROM tracks WHERE user_id = ? LIMIT 1").get(user.id);
  const steps = [
    { done: anyTrack, label: "Share your link and receive a track", href: "/dashboard/settings" },
    { done: !!active && genresFor(active).custom, label: "Choose genres for your current callout", href: "/dashboard/collections" },
    { done: anyDecision, label: "Keep or mark your first track", href: "/dashboard" },
    { done: anySet, label: "Prepare kept tracks for a set", href: "/dashboard?view=list&s=kept" },
  ];
  const stepsLeft = steps.filter((s) => !s.done).length;
  const daysLeft = active?.closes_at && !isClosed(active) ? Math.ceil((active.closes_at - Date.now()) / DAY) : null;

  return (
    <div className="space-y-6 px-4 py-6 sm:px-8">
      <header>
        <p className="text-sm text-mute">{welcome ? "Welcome to FloorTest" : new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: prefs.tz })}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {greeting}, {first}.
        </h1>
        <p className="mt-1 text-mute">
          {stats.waiting ? `${stats.waiting} track${stats.waiting === 1 ? " is" : "s are"} waiting for you.` : "Nothing is waiting. You're all caught up."}
        </p>
      </header>

      <div
        role="status"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-4 ${
          status.tone === "ok" ? "border-lime/40 bg-lime/5" : "border-danger/40 bg-danger/10"
        }`}
      >
        <p className="flex items-start gap-3">
          <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${status.tone === "ok" ? "bg-lime" : "bg-danger"}`} />
          <span>{status.text}</span>
        </p>
        {status.action}
      </div>

      {stepsLeft > 0 && (
        <Card title="Getting started" action={<span className="text-sm text-mute">{steps.length - stepsLeft} of {steps.length} done</span>}>
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  className={`flex h-full items-start gap-3 rounded-lg border p-3 text-sm transition ${s.done ? "border-line text-mute" : "border-line hover:border-mute"}`}
                >
                  <span
                    aria-hidden
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-lime text-ink" : "border border-line"}`}
                  >
                    {s.done ? "✓" : i + 1}
                  </span>
                  <span className={s.done ? "line-through" : ""}>
                    {s.label}
                    <span className="sr-only">{s.done ? " (done)" : ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Received this week" value={String(stats.receivedWeek)} note={delta(stats.receivedWeek, stats.receivedPrev)} />
        <Stat label="Waiting for a decision" value={String(stats.waiting)} note={stats.decisionRate !== null ? `${stats.decisionRate}% of last 30 days decided` : undefined} />
        <Stat label="Kept this week" value={String(stats.keptWeek)} note={delta(stats.keptWeek, stats.keptPrev)} />
        <Stat
          label="Time to first listen"
          value={stats.medianListenMs !== null ? fmtDuration(stats.medianListenMs) : "—"}
          note={stats.listenedSample ? `Median, last 30 days (${stats.listenedSample} tracks)` : "Listen to a track to start this"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          title="Up next"
          className="xl:col-span-2"
          action={
            upNext.length > 0 && (
              <Link href="/dashboard?view=queue" className="text-sm text-lime underline-offset-4 hover:underline">
                Start reviewing →
              </Link>
            )
          }
        >
          {upNext.length ? <UpNext items={upNext} /> : <p className="text-mute">Nothing waiting. New tracks will show up here first.</p>}
        </Card>

        <Card title="Current callout" action={<Link href="/dashboard/collections" className="text-sm text-mute hover:text-bone">Manage</Link>}>
          {active ? (
            <div className="space-y-3">
              <div>
                <p className="text-xl font-semibold">{active.name}</p>
                <p className="text-sm text-mute">
                  {isClosed(active)
                    ? `Closed ${fmtDay(active.closes_at!)}`
                    : daysLeft !== null
                      ? `Closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                      : "Open, no closing date"}
                  {" · "}
                  {collections.find((c) => c.id === active.id)?.count ?? 0} tracks
                </p>
              </div>
              {genresFor(active).custom && (
                <div className="flex flex-wrap gap-1.5">
                  {genresFor(active).list.map((g) => (
                    <span key={g} className="chip border-line text-mute">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              {active.bpm_min && active.bpm_max && <p className="text-sm text-mute">{active.bpm_min}–{active.bpm_max} BPM</p>}
              <p className="truncate rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm">{link.replace(/^https?:\/\//, "")}</p>
            </div>
          ) : (
            <p className="text-mute">No collection selected.</p>
          )}
        </Card>

        <Card title="Tracks received, last 14 days" className="xl:col-span-2">
          <DailyColumns data={stats.daily} />
        </Card>

        <Card title="Genres, last 30 days" action={<Link href="/dashboard?view=list" className="text-sm text-mute hover:text-bone">Filter</Link>}>
          <GenreBars data={mix} />
        </Card>

        <Card
          title="Recent activity"
          className="xl:col-span-2"
          action={<Link href="/dashboard/activity" className="text-sm text-mute hover:text-bone">All activity</Link>}
        >
          <History events={events} showSender />
        </Card>

        <Card title="Top contacts" action={<Link href="/dashboard/contacts?sort=kept" className="text-sm text-mute hover:text-bone">All contacts</Link>}>
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
