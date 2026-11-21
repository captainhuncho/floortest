"use client";

import { useEffect, useRef, useState } from "react";
import { useActionForm } from "@/components/useActionForm";
import { Turnstile } from "@/components/Turnstile";
import { SourceField } from "@/components/SourceField";
import { joinWaitlist } from "../waitlist/actions";

const ROLES = ["DJ", "Label / A&R", "Curator / radio", "Artist / producer", "Other"];

/**
 * "Join the waitlist" on the gate (owner, 31 Oct; option 55, 17 Nov): shown in the gate's glass panel in place of the
 * password form (desktop), or as a plain full screen (phones, `cs-plain` in gate.css) until "You're on the list"
 * brings the photo back. No pop-up. The fields are the sign-up ones (auth.css `af-fld`, labels above, 52px, 16px
 * text) and it saves through the same `joinWaitlist` as the home page, with the same bot check.
 */
export function WaitlistPanel({ host, botCheckKey, onBack }: { host: string; botCheckKey: string | null; onBack: () => void }) {
  const [state, onSubmit, pending] = useActionForm(joinWaitlist, undefined);
  const [handle, setHandle] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const ok = !!state?.ok;
  // Focus the heading when the panel opens and when it turns into "You're on the list", so a screen reader hears it.
  useEffect(() => heading.current?.focus(), [ok]);
  return (
    <div className={`cs-wl${ok ? "" : " cs-plain"}`}>
      {!ok && (
        <button type="button" onClick={onBack} className="cs-back">
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back
        </button>
      )}
      <h1 id="wl-h" ref={heading} tabIndex={-1} className="cs-h cs-h-sm">
        {ok ? "You're on the list" : "Join the waitlist"}
      </h1>
      <p className="cs-line">{ok ? "Invites go out in small batches, and we'll email yours." : "Invites go out in small batches. Leave your email and we'll send yours."}</p>
      {ok ? (
        <button type="button" onClick={onBack} className="af-btn af-prime">
          Done
        </button>
      ) : (
        <form method="post" onSubmit={onSubmit} className="cs-form cs-wl-form">
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <label className="block">
            <span className="cs-lab">Email</span>
            <input name="email" type="email" required autoComplete="email" maxLength={200} className="af-fld" />
          </label>
          <label className="block">
            <span className="cs-lab">Name or artist name</span>
            <input name="name" autoComplete="name" maxLength={100} className="af-fld" />
          </label>
          <label className="block">
            <span className="cs-lab">What do you do?</span>
            <select name="role" defaultValue="" className="af-fld">
              <option value="">Choose one</option>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="cs-lab">The link you&apos;d like</span>
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
            <span className="cs-lab">Instagram, SoundCloud or site (optional)</span>
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
          <button className="af-btn af-prime" disabled={pending}>
            {pending ? "Sending…" : "Request an invite"}
          </button>
        </form>
      )}
    </div>
  );
}
