"use client";

import { CuePoint } from "@/components/CuePoint";
import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useActionForm } from "@/components/useActionForm";
import { identityCode, submitIdentity } from "../actions/settings";
import { BTN, HELP, Notice, WELL } from "./ui";
import { Chip, Icon } from "@/components/Kit";

type Status = "none" | "pending" | "verified" | "rejected";

/** Show you're the real artist: profile links + a short code in one bio, checked by the FloorTest team. */
export function IdentityForm({ status, links, note }: { status: Status; links: string[]; note: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [state, onSubmit, pending] = useActionForm(submitIdentity, undefined);
  const [count, setCount] = useState(Math.max(2, links.length));
  const toast = useToast();
  const now: Status = state?.ok ? (status === "verified" ? "verified" : "pending") : status;

  useEffect(() => {
    if (now !== "verified") identityCode().then(setCode);
  }, [now]);

  if (now === "verified")
    return (
      <p className={`${WELL} flex flex-wrap items-center gap-2.5 px-3.5 py-3`}>
        <CuePoint size={20} />
        <span className="text-[13px] font-semibold text-bone">Verified</span>
        <span className="text-[12px] text-mute">Your public page shows senders it&apos;s really you.</span>
      </p>
    );

  if (now === "pending")
    return (
      <div className={`${WELL} px-3.5 py-3 text-[12.5px] leading-snug text-mute`}>
        <p>
          <span className="mr-2 align-middle"><Chip tone="warn">In review</Chip></span>
          We&apos;re checking your profiles. Keep <span className="font-mono text-bone">{code ?? "…"}</span> in your bio until you hear back, usually within a day.
        </p>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {now === "rejected" && (
        <Notice tone="error" next="Fix it below and send it again.">
          Not verified yet{note ? `: ${note}` : "."}
        </Notice>
      )}
      <ol className="list-decimal space-y-2 pl-5 text-[12.5px] leading-snug text-mute marker:text-faint">
        <li>
          Add this code to the bio of one of your profiles for a day:{" "}
          <button
            type="button"
            className="tap ml-1 inline-flex items-center gap-1.5 rounded-[9px] border border-line bg-well px-2.5 font-mono text-bone hover:border-line-2"
            onClick={() => {
              if (code) navigator.clipboard?.writeText(code);
              toast.show({ message: "Code copied" });
            }}
          >
            {code ?? "…"}
            <Icon name="copy" className="size-3.5 text-mute" />
          </button>
        </li>
        <li>List your public profiles below. We check the code is there and the profiles match your name.</li>
        <li>Once you&apos;re verified you can remove the code.</li>
      </ol>
      <div className="grid gap-2">
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            name="link"
            defaultValue={links[i] ?? ""}
            className="input"
            placeholder={["instagram.com/yourname", "soundcloud.com/yourname", "ra.co/dj/yourname", "open.spotify.com/artist/…", "yourname.bandcamp.com"][i]}
            aria-label={`Profile link ${i + 1}`}
          />
        ))}
        {count < 5 && (
          <button type="button" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[12.5px] text-mute hover:text-bone" onClick={() => setCount((c) => c + 1)}>
            <Icon name="plus" className="size-4" />
            Add another profile
          </button>
        )}
      </div>
      {state?.error && (
        <Notice tone="error" next="Check each link opens your public profile, then send again.">
          {state.error}
        </Notice>
      )}
      <p className={HELP}>We usually check within a day and email you the answer.</p>
      <button className={`${BTN} w-full sm:w-fit`} disabled={pending}>
        {pending ? "Sending…" : "Send for verification"}
      </button>
    </form>
  );
}
