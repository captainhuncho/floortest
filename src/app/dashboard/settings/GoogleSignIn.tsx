"use client";

import { useState } from "react";
import { useActionForm } from "@/components/useActionForm";
import { disconnectGoogle } from "../actions/security";
import { Chip } from "@/components/Kit";
import { BTN_DANGER, BTN_GHOST, FIELD, HELP, Notice, SettingLine, WELL } from "./ui";

const NOTES: Record<string, { text: string; next: string; good?: boolean }> = {
  connected: { text: "Google is connected. We've emailed you to confirm.", next: "Next time, choose Continue with Google on the log-in page.", good: true },
  mismatch: { text: "That Google account uses a different email.", next: "Connect the Google account for your FloorTest email instead." },
  taken: { text: "That Google account is already connected to another FloorTest account.", next: "Remove it there first, or connect a different Google account." },
  untrusted: { text: "Google sign-in works with Gmail and company Google Workspace accounts only.", next: "Try a Gmail or Workspace account, or keep signing in with your email." },
  failed: { text: "Google didn't confirm it.", next: "Press Connect Google and try again." },
};

/** Settings → Security: whether Google sign-in is connected, and connecting or removing it. */
export function GoogleSignIn({ connectedAt, note }: { connectedAt: string | null; note?: string }) {
  const [state, submit, pending] = useActionForm(disconnectGoogle, undefined);
  const [confirm, setConfirm] = useState(false);
  const on = !!connectedAt && !state?.ok;
  const n = note ? NOTES[note] : undefined;
  return (
    <div className="flex flex-col gap-4">
      <SettingLine
        title={<>Google sign-in {on ? <Chip tone="up">Connected</Chip> : <Chip>Off</Chip>}</>}
        sub={on ? `Connected ${connectedAt}. Two-factor still applies.` : "Sign in with the Google account that uses your FloorTest email."}
      >
        {!on && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/api/auth/google?link=1" className={`${BTN_GHOST} w-full sm:w-auto`}>
            Connect Google
          </a>
        )}
        {on && !confirm && (
          <button className={`${BTN_GHOST} w-full sm:w-auto`} onClick={() => setConfirm(true)}>
            Remove…
          </button>
        )}
      </SettingLine>
      {n && !state && (
        <Notice tone={n.good ? "ok" : "error"} next={n.next}>
          {n.text}
        </Notice>
      )}
      {on && confirm && (
        <form onSubmit={submit} className={`${WELL} grid gap-3 p-3.5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-4`}>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Password</span>
            <input className="input" type="password" name="password" required autoComplete="current-password" />
          </label>
          <div className="flex gap-2">
            <button className={`${BTN_DANGER} flex-1 sm:flex-none`} disabled={pending}>
              Remove
            </button>
            <button type="button" className={`${BTN_GHOST} flex-1 sm:flex-none`} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
          <span className={`${HELP} sm:col-span-2`}>Signed up with Google? Set a password first with &ldquo;Forgot your password?&rdquo; on the log-in page.</span>
          {state?.error && (
            <Notice tone="error" className="sm:col-span-2" next="Google is still connected. Check your password and try again.">
              {state.error}
            </Notice>
          )}
        </form>
      )}
    </div>
  );
}
