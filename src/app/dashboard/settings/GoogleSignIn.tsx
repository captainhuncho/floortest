"use client";

import { useState } from "react";
import { useActionForm } from "@/components/useActionForm";
import { disconnectGoogle } from "../actions/security";

const NOTES: Record<string, { text: string; good?: boolean }> = {
  connected: { text: "Google is connected. We've emailed you to confirm.", good: true },
  mismatch: { text: "That Google account uses a different email. Connect the Google account for your FloorTest email." },
  taken: { text: "That Google account is already connected to another FloorTest account." },
  untrusted: { text: "Google sign-in works with Gmail and company Google Workspace accounts only." },
  failed: { text: "Google didn't confirm it. Try again." },
};

/** Settings → Security: whether Google sign-in is connected, and connecting or removing it. */
export function GoogleSignIn({ connectedAt, note }: { connectedAt: string | null; note?: string }) {
  const [state, submit, pending] = useActionForm(disconnectGoogle, undefined);
  const [confirm, setConfirm] = useState(false);
  const on = !!connectedAt && !state?.ok;
  const n = note ? NOTES[note] : undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            Google sign-in{" "}
            <span className={`chip ml-1 ${on ? "border-lime/60 text-lime" : "border-line text-mute"}`}>{on ? "Connected" : "Off"}</span>
          </p>
          <p className="text-sm text-mute">{on ? `Connected ${connectedAt}. Two-factor still applies.` : "Sign in with the Google account that uses your FloorTest email."}</p>
        </div>
        {!on && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/api/auth/google?link=1" className="btn-ghost btn-sm">
            Connect Google
          </a>
        )}
        {on && !confirm && (
          <button className="btn-ghost btn-sm" onClick={() => setConfirm(true)}>
            Remove…
          </button>
        )}
      </div>
      {n && !state && (
        <p role="status" className={`text-sm ${n.good ? "text-lime" : "text-danger"}`}>
          {n.text}
        </p>
      )}
      {on && confirm && (
        <form onSubmit={submit} className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block space-y-1.5">
            <span className="label">Password</span>
            <input className="input" type="password" name="password" required autoComplete="current-password" />
            <span className="block text-xs text-dim">Signed up with Google? Set a password first with &ldquo;Forgot your password?&rdquo; on the log-in page.</span>
          </label>
          <div className="flex gap-2">
            <button className="btn-danger btn-sm" disabled={pending}>
              Remove
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
          {state?.error && (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
