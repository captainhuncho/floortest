import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmtDay } from "@/lib/format";
import { prefsForView } from "@/lib/notify";
import { playedOutPrompt } from "@/lib/played-out-prompt";
import { PickForm } from "./PickForm";

export const metadata = { title: "What did you play? — FloorTest" };

/** The Monday prompt's list: last week's kept tracks, minus those whose sender asked for evaluation only. */
export default async function PlayedOutPick() {
  const user = await requireUser();
  const prefs = await prefsForView(user.id);
  const prompt = await playedOutPrompt({ ...user, tz: prefs.tz });
  if (!prompt) redirect("/dashboard/floor");
  return (
    <div className="flex max-w-xl flex-col gap-5 px-3 py-4 sm:px-8 sm:py-6">
      <Link href="/dashboard/floor" className="text-[12px] text-mute hover:text-bone">
        ← The Floor
      </Link>
      <div>
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.5px] text-bone">What did you play?</h1>
        <p className="mt-1.5 text-[13px] text-mute">
          Kept last week · {fmtDay(prompt.from)} to {fmtDay(prompt.to - 1)}
        </p>
      </div>
      <PickForm tracks={prompt.tracks} />
      {prompt.heldBack.length > 0 && (
        <p className="rounded-xl border border-dashed border-line-2 px-4 py-3 text-[12px] leading-relaxed text-mute">
          Not listed: {prompt.heldBack.join(", ")}. {prompt.heldBack.length === 1 ? "Its sender" : "Their senders"} asked for evaluation only, so ask before playing{" "}
          {prompt.heldBack.length === 1 ? "it" : "them"} out.
        </p>
      )}
    </div>
  );
}
