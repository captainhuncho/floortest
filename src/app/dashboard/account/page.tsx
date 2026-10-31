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
import { CARD, Chip, Icon, IconBox, PageHead, SectionHead, initials, type IconName } from "@/components/Kit";
import { CuePoint } from "@/components/CuePoint";
import { PauseSwitch } from "../PauseSwitch";
import { LinkCard } from "./LinkCard";
import { ThemeSwitch } from "./ThemeSwitch";
import { currentTheme } from "@/lib/theme";

export const metadata = { title: "Account — FloorTest" };

/**
 * Your profile, plan and every setting (owner, 30 Oct: matches the redesign mock). Phones get one column; from 1024px
 * the profile and plan sit side by side, then the settings lists split in two.
 */

/** One list row: an icon box, the title with its one-line explanation, and whatever sits on the right. */
function Row({ href, title, sub, value, external, icon }: { href: string; title: string; sub?: string; value?: React.ReactNode; external?: boolean; icon: IconName }) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      className="group flex min-h-11 items-center gap-2.5 border-t border-line py-2 first:border-t-0"
    >
      <IconBox name={icon} small />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-bone">{title}</span>
        {sub && <span className="block truncate text-[11.5px] text-mute">{sub}</span>}
      </span>
      {value}
      {external && <span className="sr-only">(opens in a new tab)</span>}
      <span className="text-faint transition group-hover:text-bone motion-reduce:transition-none">
        <Icon name="chev" className="size-4" />
      </span>
    </Link>
  );
}

/** A titled card of rows (the mock's settings groups). */
function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${CARD} flex flex-col gap-0.5 p-3`}>
      <h2 id={id} className="pb-1 text-[11.5px] font-semibold text-mute">
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
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
  const sendOn = user.role !== "member" && (await switchOn("send_music", user));
  const referralsOn = await switchOn("referrals", user);

  const stats: [number, string][] = [
    [reviewed, "Decided"],
    [collections, "Collections"],
    [contacts, "Contacts"],
  ];

  const profile = (
    <section aria-label="Your profile and link" className={`${CARD} flex flex-col gap-3 p-3`}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-[52px] shrink-0 place-items-center rounded-[15px] border border-line bg-well text-[19px] font-bold text-lime">
          {initials(user.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[15px] font-semibold tracking-[-0.015em] text-bone">{user.name}</span>
            {/* FloorTest's own verified mark, the Cue Point tick (owner, 30 Oct: not a text chip). */}
            {user.identity_status === "verified" && <CuePoint size={16} label="Verified by FloorTest: this account controls the linked profile" />}
          </p>
          <p className="truncate text-[11.5px] text-mute">{user.email}</p>
          <p className="text-[11px] text-faint">Member since {since}</p>
        </div>
      </div>
      <LinkCard link={link} handle={user.handle} collections={cols} activeId={user.active_collection_id} canManage={user.role !== "member"} />
      {/* The Link open switch lives here on phones, where the sidebar is hidden. */}
      {user.role !== "member" && (
        <div className="border-t border-line pt-2">
          <PauseSwitch
            pause={{
              on: isPaused(user),
              until: user.pause_until ? new Date(user.pause_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: user.tz }) : null,
              untilTs: user.pause_until,
              blocked: null,
              message: user.pause_message,
            }}
          />
        </div>
      )}
    </section>
  );

  const planCard = (
    <section aria-labelledby="plan-h" className={`${CARD} flex flex-col gap-2.5 p-3`}>
      <SectionHead id="plan-h" icon="card" title={`${plan.name} plan`} aside={<Chip tone="acc">Free in the beta</Chip>} />
      <div className="flex items-baseline justify-between gap-2 text-[11.5px] text-mute tnum">
        <span>
          <strong className="text-[14px] font-semibold text-bone">{cap.used}</strong> of {cap.limit} tracks
        </span>
        <span>{pct}% used</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line-2">
        <div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
      </div>
      <dl className="mt-0.5 grid grid-cols-3 border-t border-dashed border-line-2 pt-3 text-center">
        {stats.map(([n, l]) => (
          <div key={l} className="flex min-w-0 flex-col">
            <dt className="truncate text-[11.5px] text-mute">{l}</dt>
            <dd className="text-[14px] font-semibold text-bone tnum">{n}</dd>
          </div>
        ))}
      </dl>
      <Link href="/dashboard/plans" className="flex min-h-11 items-center justify-between gap-2 rounded-[11px] border border-line bg-well px-3 text-[12.5px] font-semibold text-bone hover:border-line-2">
        See plans
        <Icon name="chev" className="size-4 text-mute" />
      </Link>
    </section>
  );

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4 sm:gap-5 xl:max-w-6xl">
        <PageHead label="Profile, plan and settings" title="Account" />

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
          {profile}
          {planCard}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            {user.role !== "owner" ? (
              // On a team desk: the team, what this role can change, and log out. Your own login lives on your own desk.
              <Group id="team-h" title={`Team · ${user.name}`}>
                <Row href="/dashboard/settings/team" icon="contacts" title="Team" sub="People on this account, roles and approvals" />
                {user.role === "admin" && (
                  <>
                    <Row href="/dashboard/settings/profile" icon="user" title="Profile" sub="Photo, name, link and profiles" />
                    <Row href="/dashboard/settings/receiving" icon="shield" title="Receiving" sub="Blocked senders and desk rules" />
                  </>
                )}
                <Row href="/dashboard/settings/account" icon="gear" title="Log out" sub="Your own login settings are on your own desk" />
              </Group>
            ) : (
              <>
                <Group id="acct-h" title="Account and security">
                  <Row href="/dashboard/settings/profile" icon="user" title="Profile" sub="Photo, name, link and profiles" />
                  <Row href="/dashboard/settings/security" icon="lock" title="Security" sub="Email, password and devices" />
                  <Row
                    href="/dashboard/settings/security"
                    icon="shield"
                    title="Two-factor authentication"
                    sub="A code from your phone when you sign in"
                    value={user.totp_enabled_at ? <Chip tone="up">On</Chip> : <Chip>Off</Chip>}
                  />
                </Group>
                <Group id="prefs-h" title="Preferences">
                  <Row href="/dashboard/settings/notifications" icon="bell" title="Notifications" sub="How and when we email you" value={<span className="text-[11.5px] text-mute">Email</span>} />
                  <div className="flex min-h-11 flex-wrap items-center gap-2.5 border-t border-line py-2">
                    <IconBox name="star" small />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-bone">Appearance</span>
                      <span className="block truncate text-[11.5px] text-mute">Night, Day, or match your device</span>
                    </span>
                    <ThemeSwitch current={theme} />
                  </div>
                </Group>
                <Group id="data-h" title="Plan and data">
                  <Row href="/dashboard/settings/plan" icon="card" title="Plan" sub="Usage and plans" />
                  <Row href="/contact?topic=data" icon="dl" title="Data export" sub="Ask for a copy of your data" />
                  <Row href="/dashboard/settings/account" icon="gear" title="Shortcuts, log out or delete account" sub="Keyboard shortcuts, leave this device, or remove everything" />
                </Group>
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <Group id="desk-h" title="Your desk">
              {sendOn && <Row href="/dashboard/send" icon="send" title="Send music" />}
              {/* Who can send to your link sits with the desk; team admins find it in their team section instead. */}
              {user.role === "owner" && <Row href="/dashboard/settings/receiving" icon="shield" title="Receiving" sub="Blocked senders and desk rules" />}
              <Row href="/dashboard/contacts" icon="contacts" title="Contacts" />
              <Row href="/dashboard/activity" icon="activity" title="Activity" />
              <Row href="/dashboard/emails" icon="mail" title="Emails to senders" sub="Everything FloorTest told them" />
              {referralsOn && <Row href="/dashboard/referrals" icon="plus" title="Referrals" sub="Invite DJs · get more active tracks" />}
            </Group>
            <Group id="about-h" title="About FloorTest">
              <Row href="/contact" icon="mail" title="Contact us" external />
              <Row href="/contact?topic=feedback" icon="reply" title="Send feedback" external />
              <Row href="/trust" icon="shield" title="Trust & security" sub="How we keep music private" external />
              <Row href="/terms" icon="prep" title="Terms & conditions" external />
              <Row href="/licenses" icon="prep" title="Legal" external />
              <Row href="/privacy" icon="lock" title="Privacy policy" external />
            </Group>
            <form action={logout}>
              <button className="flex min-h-11 w-full items-center justify-center rounded-[13px] bg-danger/12 text-[13.5px] font-semibold text-danger hover:bg-danger/20">
                Sign out
              </button>
            </form>
            <p className="text-center text-[11px] text-faint">FLOORTEST v{VERSION}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
