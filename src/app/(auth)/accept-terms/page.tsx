import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPerson, viewingAs } from "@/lib/auth";
import { currentTermsOrNull, latestAcceptance, needsTermsTick } from "@/lib/terms-record";
import { AuthFrame } from "../AuthFrame";
import { logout } from "../actions";
import { AcceptForm } from "./AcceptForm";
import { DeleteAccount } from "../../dashboard/settings/DeleteAccount";

export const metadata = { title: "Accept the Terms — FloorTest", robots: { index: false } };

/** Shown when the Terms changed since the person last accepted them (or none is recorded yet). */
export default async function AcceptTerms() {
  if (await viewingAs()) redirect("/dashboard/floor");
  const me = await currentPerson();
  if (!me) redirect("/login");
  const terms = await currentTermsOrNull();
  // Nobody gets in without agreeing (owner, 15 Nov): Terms that can't be read keep the desk closed, with a plain note.
  if (!terms)
    return (
      <AuthFrame>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="af-h">Accept the Terms</h1>
            <p className="text-[13px] text-mute">The Terms can&apos;t be loaded right now, so your desk stays closed. Try again in a minute.</p>
          </div>
          <Leave handle={me.handle} twoFactor={!!me.totp_enabled_at} ownDesk={me.actor_id === me.id} />
        </div>
      </AuthFrame>
    );
  if (!(await needsTermsTick({ userId: me.actor_id }, terms))) redirect("/dashboard/floor");
  const before = await latestAcceptance({ userId: me.actor_id });
  return (
    <AuthFrame>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="af-h">{before ? "The Terms have changed" : "Accept the Terms"}</h1>
          {before && <p className="text-[13px] font-medium">Updated {terms.version}</p>}
          <p className="text-[13px] text-mute">
            <a href="/terms" target="_blank" rel="noopener" className="underline underline-offset-4">
              Read the whole Terms
            </a>
            , then tick to keep using your desk. We email you a stamped copy.
          </p>
        </div>
        <AcceptForm hash={terms.hash} />
        <Leave handle={me.handle} twoFactor={!!me.totp_enabled_at} ownDesk={me.actor_id === me.id} />
      </div>
    </AuthFrame>
  );
}

/** Not agreeing never traps anyone (owner, 15 Nov): their data and Delete account stay in reach without the tick. */
function Leave({ handle, twoFactor, ownDesk }: { handle: string; twoFactor: boolean; ownDesk: boolean }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5">
      <p className="text-[13px] text-mute">
        Don&apos;t want to agree?{" "}
        <Link href="/contact?topic=data" className="underline underline-offset-4">
          Ask for a copy of your data
        </Link>
        , or delete your account.
      </p>
      {/* On a team's desk the account isn't theirs to delete: Delete would only send them round (Safety, 15 Nov). */}
      {ownDesk && <DeleteAccount handle={handle} twoFactor={twoFactor} sub="Your desk stays closed until you tick. You can still leave." />}
      <form action={logout}>
        <button className="min-h-11 self-start text-[13px] text-mute underline underline-offset-4">Sign out</button>
      </form>
    </div>
  );
}
