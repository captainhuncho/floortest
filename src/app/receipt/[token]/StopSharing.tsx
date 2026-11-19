"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/components/Dialog";
import { stopSharing } from "./actions";

/**
 * The artist's own off switch for private sharing of this track: a quiet link in the receipt's bar (what sharing means
 * is said under Details). Asks first; it can't be undone from here.
 */
export function StopSharing({ token, receiver }: { token: string; receiver: string }) {
  const [busy, start] = useTransition();
  const [done, setDone] = useState(false);
  const [ask, confirmDialog] = useConfirm();
  if (done)
    return (
      <p role="status" className="max-w-[40ch] text-center text-[12.5px] leading-[1.5] text-mute">
        Private sharing stopped. Nobody new can hear this track through {receiver}&apos;s share links.
      </p>
    );
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const ok = await ask({
            title: "Stop private sharing of this track?",
            body: `It leaves ${receiver}'s share links now. Anyone who already downloaded it keeps their copy, and ${receiver} would have to ask you before sharing it again.`,
            confirmLabel: "Stop sharing",
            danger: true,
          });
          if (ok) start(async () => void ((await stopSharing(token)) && setDone(true)));
        }}
        className="min-h-11 px-3 text-[13px] text-mute underline underline-offset-4"
      >
        {busy ? "Stopping…" : "Stop private sharing"}
      </button>
      {confirmDialog}
    </>
  );
}
