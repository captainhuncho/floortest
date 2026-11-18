import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL, teamOf, teamsFor, teamsOn } from "@/lib/account-members";
import { settingsWeek } from "@/lib/analytics";
import { q } from "@/lib/db";
import { capacity, isPaused } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { canMarkPlayedOut, playedOutPicks } from "@/lib/played-out-prompt";
import { settingsRows } from "@/lib/settings-menu";
import { switchOn } from "@/lib/switches";
import { currentTheme } from "@/lib/theme";
import { CuePoint } from "@/components/CuePoint";
import { Icon, initials } from "@/components/Kit";
import { ThemeSwitch } from "../../account/ThemeSwitch";
import { PauseRow } from "./PauseRow";
import { PlanRow, SwitchDeskRow } from "./PlanRow";
import { SettingsMenu } from "./SettingsMenu";
import { Group, ROW, Row, RowText } from "./rows";

export const metadata = { title: "Settings — FloorTest" };

const HOUR = 3_600_000;
/** A moment as its calendar day (YYYY-MM-DD) in a time zone. */
const dayIn = (ts: number, tz: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: tz });

/** Contacts' live line: how many people, and who sent the most today (the desk's own day). */
async function contactsLine(deskId: number, tz: string) {
  const now = Date.now();
  const [people, recent] = await Promise.all([
    q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM senders WHERE user_id = ?", deskId),
    q.all<{ sender_id: number; created_at: number }>("SELECT sender_id, created_at FROM tracks WHERE user_id = ? AND deleted_at IS NULL AND created_at >= ?", deskId, now - 26 * HOUR),
  ]);
  const today = dayIn(now, tz);
  const bySender = new Map<number, number>();
  for (const t of recent) if (dayIn(t.created_at, tz) === today) bySender.set(t.sender_id, (bySender.get(t.sender_id) ?? 0) + 1);
  const top = [...bySender].sort((a, b) => b[1] - a[1])[0];
  const name = top ? (await q.get<{ name: string }>("SELECT name FROM senders WHERE id = ? AND user_id = ?", top[0], deskId))?.name : undefined;
  const n = people?.n ?? 0;
  const line = `${n} ${n === 1 ? "person" : "people"}${top && name ? ` · ${name.split(/\s+/)[0]} sent ${top[1]} today` : ""}`;
  return { line, today: [...bySender.values()].reduce((a, b) => a + b, 0) };
}

/**
 * Settings (option 47): profile, account and settings on one page, on every size. The You row, then labelled groups:
 * Your desk, Your link and look, Settings, Plan, Help. Laptops from 1180px show two columns (Your desk and Plan on the
 * left). Sign out and Delete account live in the ••• menu and again as plain buttons at the bottom. What each role sees is decided in lib/settings-menu; the
 * pages and actions behind the rows keep their own server checks.
 */
export default async function Settings() {
  const user = await requireUser();
  const tz = user.tz || "UTC";
  const own = user.role === "owner";
  const [theme, cap, teams, myTeams, referrals, contacts, picks, joined, week] = await Promise.all([
    currentTheme(),
    capacity(user),
    teamsOn(user.id),
    teamsFor(user.actor_id),
    own ? switchOn("referrals", user) : Promise.resolve(false),
    contactsLine(user.id, tz),
    canMarkPlayedOut(user) ? playedOutPicks(user) : Promise.resolve(null),
    own ? Promise.resolve(null) : q.get<{ created_at: number }>("SELECT created_at FROM account_members WHERE account_id = ? AND user_id = ?", user.id, user.actor_id),
    // Analytics' own 7-day totals (the page's "Last 7 days"), only for the roles that may open it.
    settingsWeek(user),
  ]);
  const show = settingsRows({ role: user.role, teams, desks: 1 + myTeams.length, referrals, playedOut: !!picks });
  const team = show.team ? await teamOf(user.id) : null;

  const paused = isPaused(user);
  const until = user.pause_until ? new Date(user.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz }) : null;
  const link = `${APP_URL.replace(/^https?:\/\//, "")}/${user.handle}`;
  const since = fmtDay(user.created_at, tz);
  const photo = own && user.cover_key ? `/api/cover/${encodeURIComponent(user.handle)}?v=${encodeURIComponent(user.cover_key)}` : null;
  // On a team's desk the row is about you: your name, your role there and when you joined.
  const name = own ? user.name : user.actor_name;
  const toMark = picks?.tracks.length ?? 0;

  const plan = show.plan ? (
    <Group id="plan-h" label="Plan">
      <PlanRow used={cap.used} limit={cap.limit} since={since} />
    </Group>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Link href="/dashboard/floor" aria-label="Back to the Floor" className="grid size-11 shrink-0 place-items-center rounded-full bg-card text-bone hover:bg-well">
          <Icon name="chev" className="size-5 rotate-180" />
        </Link>
        <h1 className="flex-1 text-center text-[28px] font-bold leading-9 tracking-[-0.02em] text-bone">Settings</h1>
        <SettingsMenu everywhere={show.signOutAllMyDevices} canDelete={show.deleteAccount} twoFactor={!!user.totp_enabled_at} />
      </header>

      <section aria-label="You" className="flex flex-wrap items-center gap-3.5 rounded-[20px] border border-line bg-card p-4 min-[1180px]:flex-nowrap min-[1180px]:px-6 min-[1180px]:py-[22px]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own signed redirect, shown at 64 or 88px; next/image adds nothing here
          <img src={photo} alt="" width={88} height={88} className="size-16 shrink-0 rounded-full bg-line object-cover min-[1180px]:size-[88px]" />
        ) : (
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-line text-[22px] font-bold text-bone min-[1180px]:size-[88px] min-[1180px]:text-[30px]">
            {initials(name)}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[18px] font-bold text-bone min-[1180px]:text-[22px]">{name}</span>
            {own && user.identity_status === "verified" && <CuePoint size={16} label="Verified by FloorTest: this account controls the linked profile" />}
          </p>
          <p className="truncate text-[13px] text-mute">{own ? link : `${ROLE_LABEL[user.role]} on ${user.name}`}</p>
          <p className="text-[12px] text-mute">{own ? `Receiving since ${since}` : joined ? `Joined ${fmtDay(joined.created_at, tz)}` : null}</p>
          {show.pause && paused && <p className="mt-1.5 self-start rounded-xl bg-well px-2.5 py-1 text-[12px] text-bone">{until ? `Paused until ${until}` : "Paused"}</p>}
        </div>
        {show.editProfile && (
          <div className="flex w-full flex-wrap gap-1.5 min-[1180px]:w-auto min-[1180px]:flex-none">
            <Link href="/dashboard/settings/profile" className="inline-flex min-h-11 items-center rounded-xl border border-line px-3.5 text-[14px] font-semibold text-bone hover:border-line-2">
              Edit profile
            </Link>
            <Link href={`/${user.handle}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1.5 px-3.5 text-[14px] font-medium text-mute hover:text-bone">
              See your public page
              <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
              </svg>
              <span className="sr-only">(opens in a new tab)</span>
            </Link>
          </div>
        )}
      </section>

      {/* One column in the phone order; from 1180px two fixed columns, with Plan under Your desk on the left. Plan is
          rendered in both places and shown in one, so the reading and Tab order always match what's on screen. */}
      <div className="grid grid-cols-1 items-start gap-3 min-[1180px]:grid-cols-2 min-[1180px]:gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <Group id="desk-h" label="Your desk">
            <Row
              href="/dashboard/contacts"
              icon="contacts"
              title="Contacts"
              sub={contacts.line}
              value={contacts.today > 0 ? <span className="min-w-5 rounded-full bg-lime px-1.5 text-center text-[11px] font-bold leading-5 text-ink tnum" aria-label={`${contacts.today} new today`}>{contacts.today}</span> : undefined}
            />
            {show.analytics && week && (
              <Row href="/dashboard/analytics" icon="chart" title="Analytics" sub={`${week.in} ${week.in === 1 ? "track" : "tracks"} from ${week.senders} ${week.senders === 1 ? "sender" : "senders"} this week`} />
            )}
            {show.playedOut && <Row href="/dashboard/played-out" icon="played" title="Played out" sub={toMark ? `${toMark} kept ${toMark === 1 ? "track" : "tracks"} still to mark` : "No kept tracks to mark"} />}
          </Group>
          {plan && <div className="hidden min-[1180px]:block">{plan}</div>}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Group id="look-h" label="Your link and look">
            {show.pause && <PauseRow pause={{ on: paused, until, untilTs: user.pause_until, message: user.pause_message }} />}
            <div className={`${ROW} flex-wrap`}>
              <RowText icon="theme" title="Theme" />
              <ThemeSwitch current={theme} />
            </div>
          </Group>

          {(show.receiving || show.team || show.notifications || show.security || show.switchDesk) && (
            <Group id="settings-h" label="Settings">
              {show.receiving && <Row href="/dashboard/settings/receiving" icon="shield" title="Receiving" sub="Blocked senders and desk rules" />}
              {team && <Row href="/dashboard/settings/team" icon="person" title="Team" sub="People, roles and approvals" value={<span className="shrink-0 text-[13px] text-mute tnum">{team.used - team.invites.length} of {team.seats}</span>} />}
              {show.notifications && <Row href="/dashboard/settings/notifications" icon="bell" title="Notifications" sub="How and when we email you" value={<span className="shrink-0 text-[13px] text-mute">Email</span>} />}
              {show.security && <Row href="/dashboard/settings/security" icon="key" title="Sign-in and security" sub="Email, passkeys, two-step, devices" />}
              {show.switchDesk && (
                <SwitchDeskRow
                  desks={[
                    { id: null, name: user.actor_name, role: ROLE_LABEL.owner, current: own },
                    ...myTeams.map((t) => ({ id: t.id, name: t.name, role: ROLE_LABEL[t.role], current: t.id === user.id })),
                  ]}
                />
              )}
            </Group>
          )}

          {plan && <div className="min-[1180px]:hidden">{plan}</div>}

          <Group id="help-h" label="Help">
            {/* On laptops How it works sits in the sidebar, above Settings. */}
            <Row href="/dashboard/how-it-works" icon="help" title="How FloorTest works" className="md:hidden" />
            {show.inviteDj && <Row href="/dashboard/referrals" icon="gift" title="Invite a DJ" />}
            <Row href="/contact" icon="mail" title="Contact us" external />
            <Row href="/trust" icon="shield" title="Trust & security" external />
            <Row href="/terms" icon="card" title="Terms" external />
            <Row href="/privacy" icon="lock" title="Privacy" external />
          </Group>
        </div>
      </div>

      {/* In plain sight as well as behind the ••• (owner, 18 Nov). Same sheets, same server checks. */}
      <section aria-label="Sign out and delete account" className="mt-3 w-full min-[1180px]:mx-auto min-[1180px]:max-w-[420px]">
        <SettingsMenu variant="buttons" everywhere={show.signOutAllMyDevices} canDelete={show.deleteAccount} twoFactor={!!user.totp_enabled_at} />
      </section>
    </div>
  );
}
