import Link from "next/link";
import { logout } from "../../(auth)/actions";
import { currentSessionHash, requireUser } from "@/lib/auth";
import { capacity } from "@/lib/core";
import {q, type Sender } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { PLANS, RATE_PER_EMAIL_PER_DAY, RATE_PER_IP_PER_HOUR, RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS, SIGNALS } from "@/lib/plans";
import { blockSender, setPlan } from "../actions";
import { CoverUpload, PublicPageForm } from "./PublicPageForm";
import { DeleteAccount } from "./DeleteAccount";
import { SecurityForm } from "./SecurityForm";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings — FloorTest" };

export default async function Settings() {
  const user = await requireUser();
  const otherSessions = await q.count(
    "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ? AND token_hash <> ?",
    user.id,
    Date.now(),
    (await currentSessionHash()) ?? "",
  );
  const cap = await capacity(user);
  const blocked = (await q.all<Sender>("SELECT * FROM senders WHERE user_id = ? AND blocked_at IS NOT NULL ORDER BY blocked_at DESC", user.id));
  return (
    <div className="max-w-3xl space-y-10 px-4 py-6 sm:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Link, plan & storage</h1>

      <section className="card p-6" aria-labelledby="link-h">
        <h2 id="link-h" className="text-lg font-semibold">
          Your link
        </h2>
        <SettingsForm name={user.name} handle={user.handle} base={APP_URL} />
      </section>

      <section className="card p-6" aria-labelledby="page-h">
        <h2 id="page-h" className="text-lg font-semibold">
          Public page
        </h2>
        <p className="mt-1 text-sm text-mute">What senders see at your link. Set each callout&apos;s brief on the Collections page.</p>
        <PublicPageForm handle={user.handle} style={user.page_style} roleLine={user.role_line} />
        <CoverUpload handle={user.handle} cover={user.cover_key} />
      </section>

      <section aria-labelledby="plan-h">
        <h2 id="plan-h" className="text-lg font-semibold">
          Plan
        </h2>
        <p className="mt-1 text-mute">
          {cap.used} of {cap.limit.toLocaleString()} active songs
          {cap.bonus > 0 && ` (including ${cap.bonus} earned through referrals)`}. Deleting a song frees its slot.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Object.entries(PLANS).map(([id, p]) => {
            const current = user.plan === id;
            const tooSmall = cap.used > p.limit + cap.bonus;
            return (
              <div key={id} className={`card flex flex-col p-5 ${current ? "border-lime/60" : ""}`}>
                <p className="label">{p.name}</p>
                <p className="mt-3 text-3xl font-bold tnum">
                  ${p.price}
                  <span className="text-sm font-normal text-mute">{p.price ? "/mo" : ""}</span>
                </p>
                <p className="mt-3">{p.limit.toLocaleString()} active songs</p>
                <p className="text-sm text-mute">{p.blurb}</p>
                <form action={setPlan.bind(null, id)} className="mt-5">
                  <button className={`${current ? "btn-ghost" : "btn-lime"} btn-sm w-full`} disabled={current || tooSmall}>
                    {current ? "Current plan" : tooSmall ? "Over limit" : `Switch to ${p.name}`}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-mute">Billing isn&apos;t connected yet. Plan changes are free during the beta.</p>
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
          <li>Tracks marked could be better are deleted {RETAIN_PASSED_DAYS} days after you mark them. Kept tracks stay until you delete them.</li>
          <li>Closing dates are set per collection on the Collections page.</li>
        </ul>
      </section>

      <section aria-labelledby="signals-h">
        <h2 id="signals-h" className="text-lg font-semibold">
          What senders are told
        </h2>
        <p className="mt-1 text-mute">Senders get an email and see these on their receipt. Your keep and could-be-better calls are never shared.</p>
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
            <dt className="font-medium text-mute">Kept, Could be better</dt>
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

      <section className="card p-6" aria-labelledby="security-h">
        <h2 id="security-h" className="text-lg font-semibold">
          Password &amp; devices
        </h2>
        <p className="mt-1 text-sm text-mute">Changing your password signs out every other device and emails you a notice.</p>
        <div className="mt-5">
          <SecurityForm otherSessions={otherSessions} />
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
