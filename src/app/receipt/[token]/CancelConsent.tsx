"use client";

import { useEffect, useState, useTransition } from "react";
import { cancelShare } from "./actions";

const left = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** After Allowing: a countdown with a Cancel button. When it reaches zero the consent is final. */
export function CancelConsent({ token, requestId, receiver, finalAt }: { token: string; requestId: number; receiver: string; finalAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  const [cancelled, setCancelled] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (cancelled) return <section className="rounded-2xl border border-line bg-ink-2 p-4 text-[12px]">Cancelled. {receiver} won&apos;t share this track.</section>;
  const open = now < finalAt;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-ink-2 p-4">
      <h2 className="text-[13px] font-bold">You allowed {receiver} to share this track</h2>
      {open ? (
        <>
          <p className="text-[12px] leading-[1.6] text-mute">
            Changed your mind? You can cancel for <span className="font-bold text-bone tnum">{left(finalAt - now)}</span>. After that it&apos;s final and
            can&apos;t be withdrawn.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (await cancelShare(token, requestId)) setCancelled(true);
              })
            }
            className="w-fit rounded-md border border-line px-3 py-2 text-[12px] font-bold hover:border-danger hover:text-danger"
          >
            {pending ? "Cancelling…" : "Cancel sharing"}
          </button>
        </>
      ) : (
        <p className="text-[12px] leading-[1.6] text-mute">This is final. {receiver} can share it privately for playing in sets and promotion only.</p>
      )}
    </section>
  );
}
