"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useActionForm } from "@/components/useActionForm";
import { identityCode, submitIdentity } from "../actions";

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
      <p className="flex items-center gap-2">
        <span className="chip border-lime/60 text-lime">✓ Verified</span>
        <span className="text-sm text-mute">Your public page shows senders it&apos;s really you.</span>
      </p>
    );

  if (now === "pending")
    return (
      <div className="space-y-2 text-sm">
        <p>
          <span className="chip mr-2 border-line text-mute">In review</span>
          We&apos;re checking your profiles. Keep <span className="font-mono text-bone">{code ?? "…"}</span> in your bio until you hear back, usually within a day.
        </p>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {now === "rejected" && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          Not verified yet{note ? `: ${note}` : "."} Fix it and send it again.
        </p>
      )}
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Add this code to the bio of one of your profiles for a day:{" "}
          <button
            type="button"
            className="rounded-sm bg-ink px-2 py-0.5 font-mono text-bone hover:bg-ink-3"
            onClick={() => {
              if (code) navigator.clipboard?.writeText(code);
              toast.show({ message: "Code copied" });
            }}
          >
            {code ?? "…"}
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
          <button type="button" className="w-fit text-sm text-mute hover:text-bone" onClick={() => setCount((c) => c + 1)}>
            + Add another profile
          </button>
        )}
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button className="btn-lime btn-sm" disabled={pending}>
        {pending ? "Sending…" : "Send for verification"}
      </button>
    </form>
  );
}
