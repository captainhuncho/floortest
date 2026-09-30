import Link from "next/link";
import { logout } from "../../(auth)/actions";
import { requireUser } from "@/lib/auth";
import { capacity, isPaused } from "@/lib/core";
import { q } from "@/lib/db";
import { APP_URL } from "@/lib/mail";
import { planOf } from "@/lib/plans";
import { VERSION } from "@/lib/site";
import { PauseSwitch } from "../PauseSwitch";
import { CopyRow } from "./CopyRow";

export const metadata = { title: "Account — FloorTest" };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Figma "10 Profile + Settings": where the profile button goes on phones. */
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
  const pct = Math.min(100, Math.round((cap.used / cap.limit) * 100));
  const link = `${APP_URL}/${user.handle}`;
  const since = new Date(user.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: user.tz }).replaceAll("/", ".");

  const card = "flex flex-col gap-2 rounded-[14px] border border-[#2c2e29] bg-[#171815] p-3";
  const label = "text-[10px] font-bold tracking-[0.5px] text-[#a3a69b]";
  const rule = <div className="h-px w-full bg-[#2c2e29]" />;
  const Row = ({ href, title, value, external }: { href: string; title: string; value?: React.ReactNode; external?: boolean }) => (
    <Link href={href} target={external ? "_blank" : undefined} className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-[13px] font-medium text-[#f1f1eb]">{title}</span>
      {value ?? <span aria-hidden className="text-sm text-[#a3a69b]">{external ? "↗" : "›"}</span>}
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
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-3 font-[family-name:var(--font-stage-mono)]">
      <div className="flex h-12 items-center gap-2">
        <Link href="/dashboard/floor" aria-label="Back" className="grid size-8 place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/arrow-left.svg" alt="" className="size-4" />
        </Link>
        <span className="text-[10px] font-bold tracking-[0.5px] text-[#a3a69b]">ACCOUNT</span>
      </div>

      {/* Profile card */}
      <section className="flex flex-col gap-4 rounded-[18px] border border-[#2c2e29] bg-[#171815] p-4 drop-shadow-[0_8px_12px_rgba(0,0,0,0.15)]">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#6444ff] text-lg font-bold text-white drop-shadow-[0_8px_9px_rgba(100,68,255,0.2)]">{initials(user.name)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-[22px] font-bold text-[#f1f1eb]">{user.name}</p>
            <p className="truncate text-xs text-[#a3a69b]">{user.email}</p>
            <p className="text-[10px] text-[#85887f]">Member since {since}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-lg border border-[#2c2e29] bg-white/[0.08] px-2 py-1 text-[9px] font-bold tracking-[0.5px] text-[#f1f1eb]">
            {plan.name.toUpperCase()} · {cap.used}/{cap.limit} tracks
          </span>
          <div className="flex w-[120px] flex-col gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#2c2e29]">
              <div className="h-full rounded-full bg-[#6444ff]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[9px] text-[#85887f]">{pct}% used</p>
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
          <div key={l} className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-[#2c2e29] bg-[#171815] p-3">
            <p className="text-base font-bold text-[#f1f1eb] tnum">{n}</p>
            <p className="text-[9px] text-[#85887f]">{l}</p>
          </div>
        ))}
      </div>

      {/* Taking submissions lives here on phones, where the sidebar is hidden. */}
      <section className={card}>
        <h2 className={label}>YOUR LINK</h2>
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

      <Section
        title="YOUR DESK"
        rows={[
          <Row key="s" href="/dashboard/send" title="Send music" />,
          <Row key="c" href="/dashboard/contacts" title="Contacts" />,
          <Row key="a" href="/dashboard/activity" title="Activity" />,
          <Row key="e" href="/dashboard/emails" title="Emails to senders" />,
          <Row key="r" href="/dashboard/referrals" title="Referrals" />,
        ]}
      />
      <Section
        title="ACCOUNT"
        rows={[
          <Row key="p" href="/dashboard/settings#page-h" title="Edit profile" />,
          <Row key="e" href="/dashboard/settings#security-h" title="Email & password" />,
          <Row
            key="t"
            href="/dashboard/settings#security-h"
            title="Two-factor authentication"
            value={<span className="rounded bg-[#2a2e24] px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">{user.totp_enabled_at ? "On" : "Off"}</span>}
          />,
        ]}
      />
      <Section
        title="SUBMISSION"
        rows={[
          <CopyRow key="l" link={link} />,
          <Row key="q" href={`/api/qr/${user.handle}?format=png&download=1`} title="QR code" value={<span className="text-[11px] text-[#a3a69b]">Download</span>} />,
        ]}
      />
      <Section
        title="PREFERENCES"
        rows={[<Row key="n" href="/dashboard/notifications" title="Notifications" value={<span className="text-[11px] text-[#a3a69b]">Email</span>} />]}
      />
      <section className={card}>
        <h2 className={label}>STORAGE & PLAN</h2>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#f1f1eb]">Storage</span>
          <span className="text-[11px] text-[#a3a69b]">
            {cap.used} of {cap.limit} tracks
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#2c2e29]">
            <div className="h-full rounded-full bg-[#6444ff]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[9px] text-[#85887f]">{pct}% used</p>
        </div>
        {rule}
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#f1f1eb]">Current plan</span>
          <span className="text-[11px] text-[#a3a69b]">{plan.name}</span>
        </div>
        <Link href="/dashboard/plans" className="rounded-[10px] border border-[#6444ff] bg-[#6444ff] px-3 py-2 text-center text-[11px] font-bold text-white drop-shadow-[0_8px_10px_rgba(100,68,255,0.25)]">
          See plans · free during the beta
        </Link>
      </section>
      <Section
        title="PRIVACY"
        rows={[
          <Row key="p" href="/dashboard/settings#security-h" title="Privacy + security" />,
          <Row key="b" href="/dashboard/settings#blocked-h" title="Blocked users" />,
          <Row key="d" href="/contact?topic=data" title="Data export" />,
        ]}
      />
      <Section
        title="ABOUT FLOORTEST"
        rows={[
          <Row key="c" href="/contact" title="Contact us" external />,
          <Row key="f" href="/contact?topic=feedback" title="Send feedback" external />,
          <Row key="t" href="/trust" title="Trust & security" external />,
          <Row key="te" href="/terms" title="Terms & conditions" external />,
          <Row key="l" href="/licenses" title="Legal" external />,
          <Row key="pr" href="/privacy" title="Privacy policy" external />,
        ]}
      />
      <form action={logout}>
        <button className="w-full rounded-xl border border-[#2c2e29] bg-[#171815] p-3 text-[13px] font-bold text-[#ff5a5f]">Sign out</button>
      </form>
      <p className="text-center text-[9px] text-[#5f6158]">FLOORTEST v{VERSION}</p>
    </div>
  );
}
