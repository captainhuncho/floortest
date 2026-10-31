import { trackUse } from "@/lib/usage";
import { requireRole } from "@/lib/auth";
import { switchOn } from "@/lib/switches";
import { redirect } from "next/navigation";
import { capacity, REFERRAL_BONUS, referralCodeFor } from "@/lib/desk";
import {q } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { InviteLink } from "./InviteLink";
import { CARD, Chip, PageHead, SectionHead, StatTile, type IconName } from "@/components/Kit";

export const metadata = { title: "Referrals — FloorTest" };

type Invitee = { name: string; created_at: number; referral_rewarded_at: number | null };

export default async function Referrals() {
  const user = await requireRole("owner");
  if (!(await switchOn("referrals", user))) redirect("/dashboard/account");
  await trackUse(user.id, "referrals");
  const code = await referralCodeFor(user.id);
  const link = `${APP_URL}/signup?ref=${code}`;
  const invited = (await q.all<Invitee>("SELECT name, created_at, referral_rewarded_at FROM users WHERE referred_by = ? ORDER BY created_at DESC", user.id));
  const active = invited.filter((i) => i.referral_rewarded_at).length;
  const { bonus } = await capacity(user);

  const stats: [string, string, IconName][] = [
    ["Signed up", String(invited.length), "user"],
    ["Active", String(active), "check"],
    ["Tracks earned", `+${bonus}`, "music"],
  ];

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4 sm:gap-5">
      <header className="flex flex-col gap-2">
        <PageHead label="Invite DJs and curators" title="Referrals" />
        <p className="max-w-xl text-[13.5px] leading-6 text-mute">
          Invite DJs and curators. When someone you invite receives their first track, you both get {REFERRAL_BONUS} extra active
          tracks, on any plan, for good.
        </p>
      </header>

      <section aria-label="Your invite link" className={`${CARD} p-3 sm:p-4`}>
        <InviteLink link={link} code={code} />
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map(([k, v, icon]) => (
          <StatTile key={k} icon={icon} label={k} value={v} />
        ))}
      </div>

      <section aria-labelledby="invited-h" className={`${CARD} flex flex-col gap-1 p-3 sm:p-4`}>
        <SectionHead id="invited-h" icon="contacts" title="People you invited" />
        {invited.length === 0 ? (
          <p className="pt-1 text-[13px] text-mute">No one yet.</p>
        ) : (
          <ul className="flex flex-col">
            {invited.map((i, n) => (
              <li key={n} className={`flex min-h-11 items-center justify-between gap-3 py-2.5 ${n ? "border-t border-line" : ""}`}>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-bone">{i.name}</p>
                  <p className="text-[11.5px] text-mute">Joined {fmtDay(i.created_at)}</p>
                </div>
                {i.referral_rewarded_at ? <Chip tone="acc">+{REFERRAL_BONUS} tracks each</Chip> : <Chip>Waiting for their first track</Chip>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-[11.5px] text-faint">Bonus tracks stay if you change plans.</p>
      </div>
    </div>
  );
}
