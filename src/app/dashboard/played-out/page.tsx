import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmtDay } from "@/lib/format";
import { prefsForView } from "@/lib/notify";
import { PICK_DAYS, playedOutPicks, playedOutPrompt } from "@/lib/played-out-prompt";
import { Icon } from "@/components/Kit";
import { PickForm } from "./PickForm";

export const metadata = { title: "What did you play? — FloorTest" };

/**
 * Any day: the last 14 days' kept tracks, minus those whose sender asked for evaluation only. The Monday prompt on the
 * Floor and Tuesday's reminder email link here; on those days "None this weekend" closes the week's question.
 */
export default async function PlayedOutPick() {
  const user = await requireUser();
  const picks = await playedOutPicks(user);
  if (!picks) redirect("/dashboard/floor");
  const prefs = await prefsForView(user.id);
  const prompt = await playedOutPrompt({ ...user, tz: prefs.tz });
  const held = picks.heldBack.length > 0 && (
    <p className="rounded-[13px] border border-dashed border-line-2 px-3 py-2.5 text-[12.5px] leading-[1.45] text-mute">
      Not listed: {picks.heldBack.join(", ")}. {picks.heldBack.length === 1 ? "Its sender" : "Their senders"} asked for evaluation only, so ask before playing{" "}
      {picks.heldBack.length === 1 ? "it" : "them"} out.
    </p>
  );
  // Option 65 A (owner, 19 Nov): the title first, then the label; about 640px wide on a laptop.
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-[640px] min-w-0 flex-col gap-4">
        <Link href="/dashboard/floor" className="tap-text inline-flex min-h-11 w-fit items-center gap-1 text-[13px] text-mute hover:text-bone">
          <Icon name="chev" className="size-3.5 rotate-180" />
          The Floor
        </Link>
        <header className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">What did you play?</h1>
          <p className="mt-1 text-[13px] text-mute">
            Kept in the last {PICK_DAYS} days · {fmtDay(picks.from)} to {fmtDay(picks.to)}
          </p>
        </header>
        {picks.tracks.length ? (
          <PickForm tracks={picks.tracks} promptOpen={!!prompt}>
            {held}
          </PickForm>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 px-1 py-8 text-center">
              <p className="max-w-[34ch] text-[14px] leading-[1.45] text-mute">
                Nothing to mark. Tracks you keep show here for {PICK_DAYS} days, so you can tell their senders when you play them out.
              </p>
              <Link
                href="/dashboard/floor"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-[14px] border border-line bg-well px-5 text-[15px] font-semibold text-bone md:min-h-11 md:w-auto md:text-[14px]"
              >
                Back to the Floor
              </Link>
            </div>
            {held}
          </>
        )}
      </div>
    </div>
  );
}
