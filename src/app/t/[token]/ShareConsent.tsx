"use client";

import { useState, useTransition } from "react";
import { answerShare } from "./actions";

/**
 * The artist's yes/no to a share request. Placeholder wording, to be replaced with the lawyer's draft:
 * friendly, plain, and clear that it's for playing and promotion only.
 */
export function ShareConsent({ token, requestId, receiver, note, downloads }: { token: string; requestId: number; receiver: string; note: string; downloads: boolean }) {
  const [answer, setAnswer] = useState<"allowed" | "declined" | null>(null);
  const [pending, start] = useTransition();
  const decide = (allow: boolean) =>
    start(async () => {
      if (await answerShare(token, requestId, allow)) setAnswer(allow ? "allowed" : "declined");
    });

  if (answer)
    return (
      <section className="rounded-2xl border border-line bg-ink-2 p-4 text-[12px]">
        {answer === "allowed"
          ? `Thanks. ${receiver} can now share this track privately, for playing and promotion only. You'll see it here when they do.`
          : `No problem. ${receiver} won't share this track.`}
      </section>
    );

  return (
    <section aria-labelledby="consent-h" className="flex flex-col gap-3 rounded-2xl border border-lime/30 bg-ink-2 p-4">
      <h2 id="consent-h" className="text-[13px] font-bold">
        {receiver} would like to share this track
      </h2>
      <p className="text-[12px] leading-[1.6] text-mute">
        With someone they work with, so they can play it in their sets and help promote it. They&apos;d {downloads ? "be able to listen and download" : "only be able to listen"}, through a private
        FloorTest link that expires after 7 days. It&apos;s never for commercial release without a signed agreement with you.
      </p>
      {note && <p className="border-l-2 border-lime pl-3 text-[12px] italic text-bone">&ldquo;{note}&rdquo;</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => decide(true)} className="flex-1 rounded-md bg-lime px-3 py-2.5 text-[12px] font-bold text-ink">
          Allow
        </button>
        <button type="button" disabled={pending} onClick={() => decide(false)} className="flex-1 rounded-md border border-line px-3 py-2.5 text-[12px] font-bold hover:border-mute">
          Decline
        </button>
      </div>
      <p className="text-[10px] text-faint">Nothing changes unless you say yes.</p>
    </section>
  );
}
