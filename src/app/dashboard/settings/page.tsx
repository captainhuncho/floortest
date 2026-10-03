import Link from "next/link";
import { logout } from "../../(auth)/actions";
import { currentSessionHash, requireUser } from "@/lib/auth";
import { capacity } from "@/lib/core";
import {q, type Sender } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { RATE_PER_EMAIL_PER_DAY, RATE_PER_IP_PER_HOUR, RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS, SIGNALS } from "@/lib/plans";
import { blockSender } from "../actions";
import { CoverUpload, PublicPageForm } from "./PublicPageForm";
import { DeleteAccount } from "./DeleteAccount";
import { SecurityForm } from "./SecurityForm";
import { TwoFactor } from "./TwoFactor";
import { IdentityForm } from "./IdentityForm";
import { SettingsForm } from "./SettingsForm";
import { EmailForm } from "./EmailForm";

export const metadata = { title: "Settings — FloorTest" };

export default async function Settings() {
  const user = await requireUser();
  const identity = await q.get<{ status: "none" | "pending" | "verified" | "rejected"; links: string; note: string }>(
    "SELECT identity_status AS status, identity_links AS links, identity_note AS note FROM users WHERE id = ?",
    user.id,
  );
  const otherSessions = await q.count(
    "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ? AND token_hash <> ?",
    user.id,
    Date.now(),
    (await currentSessionHash()) ?? "",
  );
  const cap = await capacity(user);
  const pendingEmail = (await q.get<{ e: string | null }>("SELECT pending_email AS e FROM users WHERE id = ? AND pending_email_at > ?", user.id, Date.now() - 48 * 3_600_000))?.e ?? null;
  const blocked = (await q.all<Sender>("SELECT * FROM senders WHERE user_id = ? AND blocked_at IS NOT NULL ORDER BY blocked_at DESC", user.id));
  return (
    <div className="max-w-3xl space-y-10 px-4 py-6 sm:px-8">
      <h1 className="text-3xl font-bold">Settings</h1>

      <section className="card p-6" aria-labelledby="link-h">
        <h2 id="link-h" className="text-lg font-semibold">
          Your link
        </h2>
        <SettingsForm name={user.name} handle={user.handle} base={APP_URL} />
      </section>

      <section className="card p-6" aria-labelledby="email-h">
        <h2 id="email-h" className="text-lg font-semibold">
          Email
        </h2>
        <EmailForm email={user.email} pending={pendingEmail} />
      </section>

      <section className="card p-6" aria-labelledby="page-h">
        <h2 id="page-h" className="text-lg font-semibold">
          Public page
        </h2>
        <p className="mt-1 text-sm text-mute">How your link looks when shared. Set each callout&apos;s brief on the Collections page.</p>
        <PublicPageForm roleLine={user.role_line} />
        <CoverUpload handle={user.handle} cover={user.cover_key} />
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-6" aria-labelledby="plan-h">
        <div>
          <h2 id="plan-h" className="text-lg font-semibold">
            Plan
          </h2>
          <p className="mt-1 text-sm text-mute">
            {cap.used} of {cap.limit.toLocaleString()} active tracks{cap.bonus > 0 && ` (including ${cap.bonus} earned through referrals)`}.
          </p>
        </div>
        <Link href="/dashboard/plans" className="btn-ghost btn-sm">
          See plans →
        </Link>
      </section>

      <section aria-labelledby="rules-h">
        <h2 id="rules-h" className="text-lg font-semibold">
          Intake & retention rules
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-mute">
          <li>WAV or MP3 only, up to 250 MB. Files are checked for valid audio structure before they&apos;re accepted.</li>
          <li>
            Each connection can send {RATE_PER_IP_PER_HOUR} tracks an hour, and each email {RATE_PER_EMAIL_PER_DAY} a day, to your link.
          </li>
          <li>Tracks you haven&apos;t decided on are deleted {RETAIN_UNREVIEWED_DAYS} days after delivery.</li>
          <li>Tracks marked “Not for me” are deleted {RETAIN_PASSED_DAYS} days after you mark them. Kept tracks stay until you delete them.</li>
          <li>Closing dates are set per collection on the Collections page.</li>
        </ul>
      </section>

      <section aria-labelledby="signals-h">
        <h2 id="signals-h" className="text-lg font-semibold">
          What senders are told
        </h2>
        <p className="mt-1 text-mute">Senders get an email and see these on their receipt. Your keep and not-for-me calls are never shared.</p>
        <dl className="mt-3 divide-y divide-line rounded-xl border border-line">
          {[
            ["Delivered", "Their file reached your desk"],
            ["Listened", SIGNALS.listened],
            ["Downloaded", SIGNALS.downloaded],
            ["Replied", SIGNALS.replied],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <dt className="font-medium">{k}</dt>
              <dd className="text-mute">{v}</dd>
            </div>
          ))}
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
            <dt className="font-medium text-mute">Kept, Not for me</dt>
            <dd className="text-mute">Private to you</dd>
          </div>
        </dl>
        <Link href="/dashboard/emails" className="mt-3 inline-block text-sm underline underline-offset-4">
          See every email sent to senders →
        </Link>
      </section>

      <section aria-labelledby="blocked-h">
        <h2 id="blocked-h" className="text-lg font-semibold">
          Blocked senders
        </h2>
        {blocked.length === 0 ? (
          <p className="mt-1 text-mute">None. Block a sender from their contact page.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {blocked.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-mute">
                    {s.email} · blocked {fmtDay(s.blocked_at!)}
                  </p>
                </div>
                <form action={blockSender.bind(null, s.id, false)}>
                  <button className="btn-ghost btn-sm">Unblock</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-6" aria-labelledby="identity-h">
        <h2 id="identity-h" className="text-lg font-semibold">
          Verify it&apos;s you
        </h2>
        <p className="mt-1 text-sm text-mute">The Verified mark on your public page tells senders they&apos;ve found the real you, not an impersonator.</p>
        <div className="mt-5">
          <IdentityForm status={identity?.status ?? "none"} links={identity ? JSON.parse(identity.links || "[]") : []} note={identity?.note ?? ""} />
        </div>
      </section>

      <section className="card p-6" aria-labelledby="security-h">
        <h2 id="security-h" className="text-lg font-semibold">
          Sign-in &amp; security
        </h2>
        <p className="mt-1 text-sm text-mute">Changing your password signs out every other device and emails you a notice.</p>
        <div className="mt-5">
          <SecurityForm otherSessions={otherSessions} />
        </div>
        <div className="mt-6 border-t border-line pt-6">
          <TwoFactor enabled={!!user.totp_enabled_at} alerts={!!user.signin_alerts} />
        </div>
      </section>

      <section aria-labelledby="danger-h" className="border-t border-line pt-6">
        <h2 id="danger-h" className="text-lg font-semibold">
          Account
        </h2>
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <form action={logout}>
            <button className="btn-ghost btn-sm">Log out</button>
          </form>
          <DeleteAccount handle={user.handle} />
        </div>
      </section>
    </div>
  );
}
