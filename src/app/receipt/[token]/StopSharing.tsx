"use client";

import { useState, useTransition } from "react";
import { stopSharing } from "./actions";

/** The artist's own off switch for private sharing of this track. Asks first; it can't be undone from here. */
export function StopSharing({ token, receiver }: { token: string; receiver: string }) {
  const [busy, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done)
    return (
      <p role="status" className="text-[13px] text-mute">
        Private sharing stopped. Nobody new can hear this track through {receiver}&apos;s share links.
      </p>
    );
  return (
    <p className="text-[13px] text-mute">
      {receiver} may share this track privately with people they name, who must confirm their email first.{" "}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          start(async () => {
            if (!confirm(`Stop private sharing of this track? It disappears from ${receiver}'s share links now. Anyone who already downloaded it keeps their copy. ${receiver} would have to ask you to share it again.`)) return;
            if (await stopSharing(token)) setDone(true);
          })
        }
        className="text-bone underline underline-offset-4 tap-text"
      >
        {busy ? "Stopping…" : "Stop private sharing"}
      </button>
    </p>
  );
}
