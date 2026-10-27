import { CuePoint } from "@/components/CuePoint";
import Link from "next/link";
import { logout } from "../../(auth)/actions";
import { requireUser } from "@/lib/auth";
import { switchOn } from "@/lib/switches";
import { fmtDay } from "@/lib/format";
import { capacity, collectionsFor, isClosed, isPaused } from "@/lib/desk";
import { q } from "@/lib/db";
import { APP_URL } from "@/lib/mail";
import { planOf } from "@/lib/plan-store";
import { VERSION } from "@/lib/site";
import { PauseSwitch } from "../PauseSwitch";
import { LinkCard } from "./LinkCard";
import { QrRow } from "./QrRow";
import { ThemeSwitch } from "./ThemeSwitch";
import { currentTheme } from "@/lib/theme";

export const metadata = { title: "Account — FloorTest" };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Figma "10 Profile + Settings": your profile. Phones get one column; desktop splits it in two. */
const card = "flex flex-col gap-2 rounded-panel border border-line bg-ink-2 p-3 md:gap-3 md:p-5";
const label = "text-[11px] font-bold tracking-[0.5px] text-mute";
const rule = <div className="h-px w-full bg-line" />;

function Icon({ i }: { i?: string }) {
  if (!i) return null;
  return (
    <span aria-hidden className="grid w-5 shrink-0 place-items-center text-[15px] leading-none text-mute">
      {i}
    </span>
  );
}

/** One item: `sub` is the one-line explanation under it, shown on desktop. */
function Row({ href, title, sub, value, external, icon }: { href: string; title: string; sub?: string; value?: React.ReactNode; external?: boolean; icon?: string }) {
  return (
    <Link href={href} target={external ? "_blank" : undefined} className="group flex items-center gap-3 py-0.5 md:py-1">
      <Icon i={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-bone md:text-[14px]">{title}</span>
        {sub && <span className="mt-0.5 hidden truncate text-[12px] text-faint md:block">{sub}</span>}
      </span>
      {value ?? <span aria-hidden className="text-sm text-mute transition group-hover:translate-x-0.5 group-hover:text-bone">{external ? "↗" : "→"}</span>}
    </Link>
  );
}

function Section({ title, rows }: { title: string; rows: React.ReactNode[] }) {
  return (
    <section className={card}>
      <h2 className={label}>{title}</h2>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 md:gap-3">
          {i > 0 && rule}
          {r}
        </div>
      ))}
    </section>
  );
}

export default async function Account() {
  const theme = await currentTheme();
  const user = await requireUser();
  const cap = await capacity(user);
  const plan = await planOf(user.plan);
  const count = async (sql: string) => (await q.get<{ n: number }>(sql, user.id))?.n ?? 0;
  const [reviewed, collections, contacts] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND decision IS NOT NULL"),
    count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?"),
    count("SELECT COUNT(*) AS n FROM senders WHERE user_id = ?"),
  ]);
  const cols = (await collectionsFor(user.id)).map((c) => ({ id: c.id, name: c.name, closed: isClosed(c) }));
  const pct = Math.min(100, Math.round((cap.used / cap.limit) * 100));
  const link = `${APP_URL}/${user.handle}`;
  const since = fmtDay(user.created_at, user.tz);

  const stats: [number, string][] = [
    [reviewed, "Decided"],
    [collections, "Collections"],
    [contacts, "Contacts"],
  ];

  return (
    <div className="flex flex-col gap-4 px-4 py-3 md:gap-6 md:px-8 md:py-8">
      <div className="hidden items-center justify-between gap-4 md:flex">
        <h1 className="page-title">Account</h1>
        <form action={logout}>
          <button className="btn-danger btn-sm">Sign out</button>
        </form>
      </div>
      <div className="flex h-12 items-center gap-2 md:hidden">
        <Link href="/dashboard/floor" aria-label="Back" className="-ml-3 grid size-11 place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/arrow-left.svg" alt="" className="size-4" />
        </Link>
        <span className="text-[11px] font-bold tracking-[0.5px] text-mute">ACCOUNT</span>
      </div>

      {/* Who you are, your plan and your numbers: one band on desktop, stacked on phones. */}
      <section className="flex flex-col gap-4 rounded-panel border border-line bg-ink-2 p-4 md:p-6 xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] xl:items-center xl:gap-8">
        <div className="flex items-center gap-3 md:gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#6444ff] text-lg font-bold text-white md:size-16">{initials(user.name)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="flex min-w-0 items-center gap-2 text-[22px] font-bold text-bone">
              <span className="truncate">{user.name}</span>
              {user.identity_status === "verified" && <CuePoint size={20} label="Verified" />}
            </p>
            <p className="truncate text-xs text-mute md:text-[13px]">{user.email}</p>
            <p className="text-[11px] text-dim">Member since {since}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-bold text-bone">{plan.name} plan</span>
            <span className="text-[11px] text-mute tnum">
              {cap.used} of {cap.limit} tracks
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-[#6444ff]" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-dim">{pct}% used</span>
            <Link href="/dashboard/plans" className="text-[11px] font-bold text-bone underline-offset-4 hover:underline">
              See plans · free in the beta →
            </Link>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 xl:flex xl:gap-8 xl:border-l xl:border-line xl:pl-8">
          {stats.map(([n, l]) => (
            <div key={l} className="flex min-w-0 flex-col gap-1 xl:shrink-0">
              <dt className="order-2 text-[11px] font-bold uppercase tracking-[1px] text-dim">{l}</dt>
              <dd className="order-1 text-base font-bold text-bone tnum md:text-[22px]">{n}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 md:gap-6">
          {/* The Link open switch lives here on phones, where the sidebar is hidden. */}
          <section className={card}>
            <h2 className={label}>YOUR LINK</h2>
            <LinkCard link={link} handle={user.handle} collections={cols} activeId={user.active_collection_id} canManage={user.role !== "member"} />
            {rule}
            <QrRow handle={user.handle} link={link} />
            {user.role !== "member" && rule}
            {user.role !== "member" && <PauseSwitch
              pause={{
                on: isPaused(user),
                until: user.pause_until ? new Date(user.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: user.tz }) : null,
                untilTs: user.pause_until,
                blocked: null,
                message: user.pause_message,
              }}
            />}
          </section>
          <Section
            title="YOUR DESK"
            rows={[
              ...(user.role !== "member" && (await switchOn("send_music", user)) ? [<Row key="s" href="/dashboard/send" icon="↑" title="Send music" />] : []),
              // Who can send to your link sits with the desk; team admins find it in their team section instead.
              ...(user.role === "owner" ? [<Row key="b" href="/dashboard/settings/receiving" icon="⊘" title="Receiving" sub="Blocked senders and desk rules" />] : []),
              <Row key="c" href="/dashboard/contacts" icon="☰" title="Contacts" />,
              <Row key="a" href="/dashboard/activity" icon="◷" title="Activity" />,
              <Row key="e" href="/dashboard/emails" icon="✉" title="Emails to senders" sub="Everything FloorTest told them" />,
              ...((await switchOn("referrals", user)) ? [<Row key="r" href="/dashboard/referrals" icon="+" title="Referrals" sub="Invite DJs · get more active tracks" />] : []),
            ]}
          />
        </div>
        <div className="flex flex-col gap-4 md:gap-6">
          {user.role !== "owner" ? (
            // On a team desk: the team, what this role can change, and log out. Your own login lives on your own desk.
            <Section
              title={`TEAM · ${user.name.toUpperCase()}`}
              rows={[
                <Row key="t" href="/dashboard/settings/team" icon="◫" title="Team" sub="People on this account, roles and approvals" />,
                ...(user.role === "admin"
                  ? [
                      <Row key="p" href="/dashboard/settings/profile" icon="✎" title="Profile" sub="Photo, name, link and profiles" />,
                      <Row key="b" href="/dashboard/settings/receiving" icon="⊘" title="Receiving" sub="Blocked senders and desk rules" />,
                    ]
                  : []),
                <Row key="a" href="/dashboard/settings/account" icon="⏻" title="Log out" sub="Your own login settings are on your own desk" />,
              ]}
            />
          ) : (
            <>
            <Section
              title="ACCOUNT"
              rows={[
                <Row key="p" href="/dashboard/settings/profile" icon="✎" title="Profile" sub="Photo, name, link and profiles" />,
                <Row key="e" href="/dashboard/settings/security" icon="@" title="Security" sub="Email, password and devices" />,
                <Row
                  key="t"
                  href="/dashboard/settings/security"
                  icon="⚿"
                  title="Two-factor authentication"
                  sub="A code from your phone when you sign in"
                  value={<span className="rounded bg-ink-4 px-1.5 py-0.5 text-[11px] font-bold uppercase text-bone">{user.totp_enabled_at ? "On" : "Off"}</span>}
                />,
              ]}
            />
            <Section
              title="PREFERENCES"
              rows={[
                <Row key="n" href="/dashboard/settings/notifications" icon="◎" title="Notifications" sub="How and when we email you" value={<span className="text-[11px] text-mute">Email</span>} />,
                <div key="t" className="flex items-center gap-3 py-1">
                  <span aria-hidden className="grid w-5 shrink-0 place-items-center text-[15px] leading-none text-mute">◐</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-bone md:text-[14px]">Appearance</span>
                    <span className="mt-0.5 hidden text-[12px] text-faint md:block">Night, Day, or match your device</span>
                  </span>
                  <ThemeSwitch current={theme} />
                </div>,
              ]}
            />
            <Section
              title="PLAN & DATA"
              rows={[
                <Row key="p" href="/dashboard/settings/plan" icon="▤" title="Plan" sub="Usage and plans" />,
                <Row key="d" href="/contact?topic=data" icon="⇩" title="Data export" sub="Ask for a copy of your data" />,
                <Row key="a" href="/dashboard/settings/account" icon="⏻" title="Shortcuts, log out or delete account" sub="Keyboard shortcuts, leave this device, or remove everything" />,
              ]}
            />
            </>
          )}
          <Section
            title="ABOUT FLOORTEST"
            rows={[
              <Row key="c" href="/contact" icon="✆" title="Contact us" external />,
              <Row key="f" href="/contact?topic=feedback" icon="✎" title="Send feedback" external />,
              <Row key="t" href="/trust" icon="✓" title="Trust & security" sub="How we keep music private" external />,
              <Row key="te" href="/terms" icon="§" title="Terms & conditions" external />,
              <Row key="l" href="/licenses" icon="¶" title="Legal" external />,
              <Row key="pr" href="/privacy" icon="⚑" title="Privacy policy" external />,
            ]}
          />
        </div>
      </div>

      <form action={logout} className="mt-2 md:hidden">
        <button className="btn-danger w-full">Sign out</button>
      </form>
      <p className="text-center text-[11px] text-faint">FLOORTEST v{VERSION}</p>
    </div>
  );
}
