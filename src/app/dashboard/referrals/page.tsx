import Link from "next/link";
import { trackUse } from "@/lib/usage";
import { requireRole } from "@/lib/auth";
import { switchOn } from "@/lib/switches";
import { redirect } from "next/navigation";
import { capacity, REFERRAL_BONUS, referralCodeFor } from "@/lib/desk";
import { q } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { APP_URL } from "@/lib/mail";
import { InviteLink } from "./InviteLink";
import { Icon, initials } from "@/components/Kit";

export const metadata = { title: "Referrals — FloorTest" };

type Invitee = { name: string; created_at: number; referral_rewarded_at: number | null };

/**
 * Referrals (option 64 A, 19 Nov): the invite link first, the counts as one line, then each person with their state
 * as a word (a lime dot when the bonus landed). Phones show the list bare; from md up it sits in one card, ~760px wide.
 */
export default async function Referrals() {
  const user = await requireRole("owner");
  if (!(await switchOn("referrals", user))) redirect("/dashboard/settings");
  await trackUse(user.id, "referrals");
  const code = await referralCodeFor(user.id);
  const link = `${APP_URL}/signup?ref=${code}`;
  const invited = (await q.all<Invitee>("SELECT name, created_at, referral_rewarded_at FROM users WHERE referred_by = ? ORDER BY created_at DESC", user.id));
  const active = invited.filter((i) => i.referral_rewarded_at).length;
  const { bonus } = await capacity(user);

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-[760px] flex-col">
        <Link href="/dashboard/settings" className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-xl px-2 text-[14px] text-mute hover:text-bone md:hidden">
          <Icon name="chev" className="size-4 rotate-180" />
          Settings
        </Link>
        <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em] text-bone">Referrals</h1>
        <p className="mb-3 mt-1 text-[14px] leading-[1.45] text-mute">
          Invite DJs and curators. When someone you invite receives their first track, you both get {REFERRAL_BONUS} extra active
          tracks, on any plan, for good.
        </p>

        <section aria-label="Your invite link" className="rounded-[14px] border border-line bg-card px-3.5 py-3">
          <InviteLink link={link} code={code} />
        </section>

        <p className="mt-3.5 text-[14px] text-mute">
          <b className="font-semibold text-bone tnum">{invited.length}</b> signed up · <b className="font-semibold text-bone tnum">{active}</b> active ·{" "}
          <b className="font-semibold text-bone tnum">+{bonus}</b> tracks earned
        </p>

        <section aria-labelledby="invited-h" className="mt-[18px]">
          <h2 id="invited-h" className="mb-1.5 text-[13px] font-semibold text-mute">
            People you invited
          </h2>
          <div className="md:rounded-2xl md:border md:border-line md:bg-card md:px-4 md:py-1">
            {invited.length === 0 ? (
              <div className="py-3">
                <p className="text-[15px] font-semibold text-bone">No one yet.</p>
                <p className="mt-0.5 text-[13px] leading-[1.4] text-mute">
                  Send your link to a DJ or curator you swap music with. You both get {REFERRAL_BONUS} tracks when their first track arrives.
                </p>
              </div>
            ) : (
              <ul>
                {invited.map((i, n) => (
                  <li key={n} className="flex min-h-[60px] items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-line text-[13px] font-bold text-bone">
                      {initials(i.name)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-[15px] font-semibold leading-[1.3] text-bone">{i.name}</p>
                      <p className="text-[13px] leading-[1.4] text-mute">Joined {fmtDay(i.created_at)}</p>
                    </div>
                    {i.referral_rewarded_at ? (
                      <span className="flex shrink-0 items-center text-[12px] font-semibold text-bone">
                        <i aria-hidden className="mr-[5px] inline-block size-1.5 rounded-full bg-lime" />+{REFERRAL_BONUS} tracks each
                      </span>
                    ) : (
                      <span className="max-w-[120px] shrink-0 text-right md:max-w-none text-[12px] text-mute">Waiting for their first track</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <p className="mt-2.5 text-[12px] text-mute">Bonus tracks stay if you change plans.</p>
      </div>
    </div>
  );
}
