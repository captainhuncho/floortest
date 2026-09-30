"use client";

import { useEffect, useState } from "react";
import { useActionForm } from "@/components/useActionForm";
import { joinWaitlist } from "./waitlist/actions";

const field = "w-full rounded-md border border-white/15 bg-black/30 px-4 py-3 font-[family-name:var(--font-stage-mono)] text-sm text-bone outline-none placeholder:text-dim focus:border-lime/70";

export function WaitlistForm({ host }: { host: string }) {
  const [state, onSubmit, pending] = useActionForm(joinWaitlist, undefined);
  const [handle, setHandle] = useState("");
  // The claim box in the hero hands over the name typed there.
  useEffect(() => {
    const take = (e: Event) => setHandle(String((e as CustomEvent).detail || ""));
    window.addEventListener("floortest:claim", take);
    return () => window.removeEventListener("floortest:claim", take);
  }, []);
  if (state?.ok)
    return (
      <p role="status" className="rounded-md border border-lime/40 bg-lime/[0.06] px-5 py-4 font-[family-name:var(--font-stage-mono)] text-sm">
        You&apos;re on the list. Invites go out in small batches, and we&apos;ll email yours. Know someone already on FloorTest? Ask them for an invite link.
      </p>
    );
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <input name="name" className={field} placeholder="Name or artist name" aria-label="Name" maxLength={100} />
      <input name="email" type="email" required className={field} placeholder="Email" aria-label="Email" maxLength={200} />
      <select name="role" className={field} aria-label="What you do" defaultValue="">
        <option value="">What do you do?</option>
        <option>DJ</option>
        <option>Label / A&amp;R</option>
        <option>Curator / radio</option>
        <option>Artist / producer</option>
        <option>Other</option>
      </select>
      <label className={`${field} flex items-center gap-0 sm:col-span-2`}>
        <span className="min-w-0 max-w-[60%] shrink truncate text-dim">{host}/</span>
        <input
          name="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30))}
          placeholder="the link you'd like"
          aria-label="The link you'd like"
          className="min-w-[6rem] flex-1 bg-transparent text-lime outline-none placeholder:text-dim"
        />
      </label>
      <input name="link" className={field} placeholder="Instagram, SoundCloud or site (optional)" aria-label="Link" maxLength={200} />
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button className="rounded-md bg-lime px-6 py-3.5 font-[family-name:var(--font-stage-mono)] text-sm font-medium uppercase text-ink hover:brightness-95" disabled={pending}>
          {pending ? "Sending…" : "Request an invite →"}
        </button>
        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
