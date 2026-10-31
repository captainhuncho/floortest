"use client";

import "../(auth)/auth.css";
import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { useActionForm } from "@/components/useActionForm";
import { Turnstile } from "@/components/Turnstile";
import { SourceField } from "@/components/SourceField";
import { joinWaitlist } from "../waitlist/actions";

const ROLES = ["DJ", "Label / A&R", "Curator / radio", "Artist / producer", "Other"];

/**
 * "Join the waitlist" on the gate (owner, 31 Oct): one button under the password that opens the waitlist in the shared
 * pop-up (a bottom sheet on phones), so the gate itself stays as it is. The fields are the sign-up ones (auth.css
 * `af-fld`, labels above, 52px, 16px text) and it saves through the same `joinWaitlist` as the home page.
 */
export function WaitlistDialog({ host, botCheckKey }: { host: string; botCheckKey: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useActionForm(joinWaitlist, undefined);
  const [handle, setHandle] = useState("");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost mt-3 min-h-11 w-full rounded-[13px]">
        Join the waitlist
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        busy={pending}
        title={state?.ok ? "You're on the list" : "Join the waitlist"}
        description={state?.ok ? "Invites go out in small batches, and we'll email yours." : "Invites go out in small batches. Leave your email and we'll send yours."}
      >
        {state?.ok ? (
          <button type="button" onClick={() => setOpen(false)} className="af-btn af-prime">
            Done
          </button>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 [--af-field-bg:var(--color-ink-3)]">
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <label className="block">
              <span className="af-lab">Email</span>
              <input name="email" type="email" required autoComplete="email" maxLength={200} className="af-fld" />
            </label>
            <label className="block">
              <span className="af-lab">Name or artist name</span>
              <input name="name" autoComplete="name" maxLength={100} className="af-fld" />
            </label>
            <label className="block">
              <span className="af-lab">What do you do?</span>
              <select name="role" defaultValue="" className="af-fld">
                <option value="">Choose one</option>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="af-lab">The link you&apos;d like</span>
              <span className="af-fld">
                <span className="af-pre">{host}/</span>
                <input
                  name="handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30))}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </span>
            </label>
            <label className="block">
              <span className="af-lab">Instagram, SoundCloud or site (optional)</span>
              <input name="link" maxLength={200} className="af-fld" />
            </label>
            <SourceField />
            <div className="empty:hidden has-[>div:empty]:hidden">
              <Turnstile action="waitlist" siteKey={botCheckKey} />
            </div>
            {state?.error && (
              <p role="alert" className="af-alert">
                {state.error}
              </p>
            )}
            <button className="af-btn af-prime mt-2" disabled={pending}>
              {pending ? "Sending…" : "Request an invite"}
            </button>
          </form>
        )}
      </Dialog>
    </>
  );
}
