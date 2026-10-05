import { trackUse } from "@/lib/usage";
import { requireUser } from "@/lib/auth";
import { capacity, REFERRAL_BONUS, referralCodeFor } from "@/lib/desk";
import {q } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { InviteLink } from "./InviteLink";

export const metadata = { title: "Referrals — FloorTest" };

type Invitee = { name: string; created_at: number; referral_rewarded_at: number | null };

export default async function Referrals() {
  const user = await requireUser();
  await trackUse(user.id, "referrals");
  const code = await referralCodeFor(user.id);
  const link = `${APP_URL}/signup?ref=${code}`;
  const invited = (await q.all<Invitee>("SELECT name, created_at, referral_rewarded_at FROM users WHERE referred_by = ? ORDER BY created_at DESC", user.id));
  const active = invited.filter((i) => i.referral_rewarded_at).length;
  const { bonus } = await capacity(user);

  return (
    <div className="max-w-3xl space-y-10 px-4 py-6 sm:px-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Referrals</h1>
        <p className="mt-2 max-w-xl text-mute">
          Invite DJs and curators. When someone you invite receives their first track, you both get {REFERRAL_BONUS} extra active
          tracks, on any plan, for good.
        </p>
      </div>

      <section className="card p-6">
        <InviteLink link={link} code={code} />
      </section>

      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          ["Signed up", invited.length],
          ["Active", active],
          ["Tracks earned", `+${bonus}`],
        ].map(([k, v]) => (
          <div key={k} className="card p-5">
            <dt className="label">{k}</dt>
            <dd className="mt-2 text-3xl font-bold tnum">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="invited-h">
        <h2 id="invited-h" className="text-lg font-semibold">
          People you invited
        </h2>
        {invited.length === 0 ? (
          <p className="mt-2 text-mute">No one yet. Share your invite link in a DJ group chat or with a label you work with.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {invited.map((i, n) => (
              <li key={n} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="text-sm text-mute">Joined {fmtDay(i.created_at)}</p>
                </div>
                {i.referral_rewarded_at ? (
                  <span className="chip border-lime/60 text-lime">+{REFERRAL_BONUS} tracks each</span>
                ) : (
                  <span className="chip border-line text-mute">Waiting for their first track</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="text-sm text-mute">
        <h2 className="font-semibold text-bone">How it works</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>They sign up with your link.</li>
          <li>The bonus unlocks when their link receives its first track, so only real desks count.</li>
          <li>Bonus tracks add to your plan limit and stay if you change plans.</li>
        </ul>
      </section>
    </div>
  );
}
