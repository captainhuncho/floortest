import { redirect } from "next/navigation";
import { currentPerson, viewingAs } from "@/lib/auth";
import { currentTerms, latestAcceptance, needsTermsTick } from "@/lib/terms-record";
import { AuthFrame } from "../AuthFrame";
import { AcceptForm } from "./AcceptForm";

export const metadata = { title: "Accept the Terms — FloorTest", robots: { index: false } };

/** Shown when the Terms changed since the person last accepted them (or none is recorded yet). */
export default async function AcceptTerms() {
  if (await viewingAs()) redirect("/dashboard/floor");
  const me = await currentPerson();
  if (!me) redirect("/login");
  const terms = await currentTerms();
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
      </div>
    </AuthFrame>
  );
}
