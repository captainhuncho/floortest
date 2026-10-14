import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmtDay } from "@/lib/format";
import { prefsForView } from "@/lib/notify";
import { PICK_DAYS, playedOutPicks, playedOutPrompt } from "@/lib/played-out-prompt";
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
  return (
    <div className="flex max-w-xl flex-col gap-5 px-3 py-4 sm:px-8 sm:py-6">
      <Link href="/dashboard/floor" className="text-[12px] text-mute hover:text-bone">
        ← The Floor
      </Link>
      <div>
        <h1 className="page-title">What did you play?</h1>
        <p className="mt-1.5 text-[13px] text-mute">
          Kept in the last {PICK_DAYS} days · {fmtDay(picks.from)} to {fmtDay(picks.to)}
        </p>
      </div>
      {picks.tracks.length ? (
        <PickForm tracks={picks.tracks} promptOpen={!!prompt} />
      ) : (
        <p className="card p-4 text-[13px] leading-relaxed text-mute">
          Nothing to mark. Tracks you keep show here for {PICK_DAYS} days, so you can tell their senders when you play them out.
        </p>
      )}
      {picks.heldBack.length > 0 && (
        <p className="rounded-xl border border-dashed border-line-2 px-4 py-3 text-[12px] leading-relaxed text-mute">
          Not listed: {picks.heldBack.join(", ")}. {picks.heldBack.length === 1 ? "Its sender" : "Their senders"} asked for evaluation only, so ask before playing{" "}
          {picks.heldBack.length === 1 ? "it" : "them"} out.
        </p>
      )}
    </div>
  );
}
