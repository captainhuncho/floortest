import Link from "next/link";
import { logout } from "../../(auth)/actions";
import { requireUser } from "@/lib/auth";
import { capacity, collectionsFor, isClosed, isPaused } from "@/lib/core";
import { q } from "@/lib/db";
import { APP_URL } from "@/lib/mail";
import { planOf } from "@/lib/plans";
import { VERSION } from "@/lib/site";
import { PauseSwitch } from "../PauseSwitch";
import { LinkCard } from "./LinkCard";

export const metadata = { title: "Account — FloorTest" };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Figma "10 Profile + Settings": your profile. Phones get one column; desktop splits it in two. */
export default async function Account() {
  const user = await requireUser();
  const cap = await capacity(user);
  const plan = planOf(user.plan);
  const count = async (sql: string) => (await q.get<{ n: number }>(sql, user.id))?.n ?? 0;
  const [reviewed, collections, contacts] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ? AND decision IS NOT NULL"),
    count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?"),
    count("SELECT COUNT(*) AS n FROM senders WHERE user_id = ?"),
  ]);
  const cols = (await collectionsFor(user.id)).map((c) => ({ id: c.id, name: c.name, closed: isClosed(c) }));
  const pct = Math.min(100, Math.round((cap.used / cap.limit) * 100));
  const link = `${APP_URL}/${user.handle}`;
  const since = new Date(user.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: user.tz }).replaceAll("/", ".");

  const card = "flex flex-col gap-2 rounded-[14px] border border-line bg-ink-2 p-3";
  const label = "text-[10px] font-bold tracking-[0.5px] text-mute";
  const rule = <div className="h-px w-full bg-line" />;
  // `sub`: the one-line explanation under each item, shown on desktop (the old profile menu had these).
  const Icon = ({ i }: { i?: string }) =>
    i ? (
      <span aria-hidden className="grid w-5 shrink-0 place-items-center text-[15px] leading-none text-mute">
        {i}
      </span>
    ) : null;
  const Row = ({ href, title, sub, value, external, icon }: { href: string; title: string; sub?: string; value?: React.ReactNode; external?: boolean; icon?: string }) => (
    <Link href={href} target={external ? "_blank" : undefined} className="group flex items-center gap-3 py-0.5">
      <Icon i={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-bone">{title}</span>
        {sub && <span className="mt-0.5 hidden truncate text-[10px] text-faint md:block">{sub}</span>}
      </span>
      {value ?? <span aria-hidden className="text-sm text-mute transition group-hover:translate-x-0.5 group-hover:text-bone">{external ? "↗" : "→"}</span>}
    </Link>
  );
  const Section = ({ title, rows }: { title: string; rows: React.ReactNode[] }) => (
    <section className={card}>
      <h2 className={label}>{title}</h2>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-2">
          {i > 0 && rule}
          {r}
        </div>
      ))}
    </section>
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-3 font-[family-name:var(--font-stage-mono)] md:mx-0 md:grid md:max-w-6xl md:grid-cols-[minmax(0,380px)_minmax(0,1fr)] md:items-start md:gap-6 md:px-8 md:py-6">
      <h1 className="hidden text-[32px] font-bold text-bone md:col-span-2 md:block">Account</h1>
      <div className="flex h-12 items-center gap-2 md:hidden">
        <Link href="/dashboard/floor" aria-label="Back" className="grid size-8 place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/arrow-left.svg" alt="" className="size-4" />
        </Link>
        <span className="text-[10px] font-bold tracking-[0.5px] text-mute">ACCOUNT</span>
      </div>

      <div className="contents md:flex md:flex-col md:gap-4">
      {/* Profile card */}
      <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-ink-2 p-4 drop-shadow-[0_8px_12px_rgba(0,0,0,0.15)]">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#6444ff] text-lg font-bold text-white drop-shadow-[0_8px_9px_rgba(100,68,255,0.2)]">{initials(user.name)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-[22px] font-bold text-bone">{user.name}</p>
            <p className="truncate text-xs text-mute">{user.email}</p>
            <p className="text-[10px] text-dim">Member since {since}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-lg border border-line bg-white/[0.08] px-2 py-1 text-[9px] font-bold tracking-[0.5px] text-bone">
            {plan.name.toUpperCase()} · {cap.used}/{cap.limit} tracks
          </span>
          <div className="flex w-[120px] flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-[#6444ff]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[9px] text-dim">{pct}% used</p>
          </div>
        </div>
      </section>

      {/* Quick stats */}
      <div className="flex gap-2">
        {[
          [reviewed, "tracks reviewed"],
          [collections, "collections"],
          [contacts, "contacts"],
        ].map(([n, l]) => (
          <div key={l} className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-line bg-ink-2 p-3">
            <p className="text-base font-bold text-bone tnum">{n}</p>
            <p className="text-[9px] text-dim">{l}</p>
          </div>
        ))}
      </div>

      {/* Taking submissions lives here on phones, where the sidebar is hidden. */}
      <section className={card}>
        <h2 className={label}>YOUR LINK</h2>
        <LinkCard link={link} handle={user.handle} collections={cols} activeId={user.active_collection_id} />
        {rule}
        <PauseSwitch
          pause={{
            on: isPaused(user),
            until: user.pause_until ? new Date(user.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: user.tz }) : null,
            untilTs: user.pause_until,
            blocked: null,
            message: user.pause_message,
          }}
        />
      </section>

      <section className={card}>
        <h2 className={label}>STORAGE & PLAN</h2>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-bone">Storage</span>
          <span className="text-[11px] text-mute">
            {cap.used} of {cap.limit} tracks
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-[#6444ff]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[9px] text-dim">{pct}% used</p>
        </div>
        {rule}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-bone">Current plan</span>
          <span className="text-[11px] text-mute">{plan.name}</span>
        </div>
        <Link href="/dashboard/plans" className="rounded-[10px] border border-[#6444ff] bg-[#6444ff] px-3 py-2 text-center text-[11px] font-bold text-white drop-shadow-[0_8px_10px_rgba(100,68,255,0.25)]">
          See plans · free during the beta
        </Link>
      </section>
      </div>

      <div className="contents md:flex md:flex-col md:gap-4">
      <Section
        title="YOUR DESK"
        rows={[
          <Row key="s" href="/dashboard/send" icon="↑" title="Send music" sub="Send music to another FloorTest user" />,
          <Row key="c" href="/dashboard/contacts" icon="☰" title="Contacts" sub="Everyone who sent you music" />,
          <Row key="a" href="/dashboard/activity" icon="◷" title="Activity" sub="Everything you did, newest first" />,
          <Row key="e" href="/dashboard/emails" icon="✉" title="Emails to senders" sub="Everything FloorTest told them" />,
          <Row key="r" href="/dashboard/referrals" icon="+" title="Referrals" sub="Invite DJs · earn track slots" />,
        ]}
      />
      <Section
        title="ACCOUNT"
        rows={[
          <Row key="p" href="/dashboard/settings#page-h" icon="✎" title="Edit profile" sub="Name, link name, public page and cover photo" />,
          <Row key="e" href="/dashboard/settings#security-h" icon="@" title="Email & password" sub="Change your sign-in details" />,
          <Row
            key="t"
            href="/dashboard/settings#security-h"
            icon="⚿" title="Two-factor authentication"
            sub="A code from your phone when you sign in"
            value={<span className="rounded bg-ink-4 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">{user.totp_enabled_at ? "On" : "Off"}</span>}
          />,
        ]}
      />
      <Section
        title="SUBMISSION"
        rows={[
          <div key="q" className="flex items-center gap-3 py-0.5">
            <Icon i="▦" />
            <a href={`/api/qr/${user.handle}?format=svg`} target="_blank" className="min-w-0 flex-1 text-[13px] font-medium text-bone hover:underline">
              QR code <span className="text-[11px] font-normal text-mute">(view)</span>
              <span className="mt-0.5 hidden text-[10px] font-normal text-faint md:block">For flyers, screens and stories</span>
            </a>
            <span className="flex gap-3 text-[11px]">
              <a href={`/api/qr/${user.handle}?format=png&download=1`} className="text-mute hover:text-bone">
                PNG ↓
              </a>
              <a href={`/api/qr/${user.handle}?format=svg&download=1`} className="text-mute hover:text-bone">
                SVG ↓
              </a>
            </span>
          </div>,
        ]}
      />
      <Section
        title="PREFERENCES"
        rows={[<Row key="n" href="/dashboard/notifications" icon="◎" title="Notifications" sub="How and when we email you" value={<span className="text-[11px] text-mute">Email</span>} />]}
      />
      <Section
        title="PRIVACY"
        rows={[
          <Row key="p" href="/dashboard/settings#security-h" icon="⛨" title="Privacy + security" sub="Sessions, sign-in alerts and verification" />,
          <Row key="b" href="/dashboard/settings#blocked-h" icon="⊘" title="Blocked users" sub="Senders who can no longer reach you" />,
          <Row key="d" href="/contact?topic=data" icon="⇩" title="Data export" sub="Ask for a copy of your data" />,
        ]}
      />
      <Section
        title="ABOUT FLOORTEST"
        rows={[
          <Row key="c" href="/contact" icon="✆" title="Contact us" sub="Questions, problems, anything" external />,
          <Row key="f" href="/contact?topic=feedback" icon="✎" title="Send feedback" sub="Tell us what to fix or build" external />,
          <Row key="t" href="/trust" icon="✓" title="Trust & security" sub="How we keep music private" external />,
          <Row key="te" href="/terms" icon="§" title="Terms & conditions" external />,
          <Row key="l" href="/licenses" icon="¶" title="Legal" external />,
          <Row key="pr" href="/privacy" icon="⚑" title="Privacy policy" external />,
        ]}
      />
      <form action={logout}>
        <button className="w-full rounded-xl border border-line bg-ink-2 p-3 text-[13px] font-bold text-[#ff5a5f]">Sign out</button>
      </form>
      <p className="text-center text-[9px] text-faint">FLOORTEST v{VERSION}</p>
      </div>
    </div>
  );
}
