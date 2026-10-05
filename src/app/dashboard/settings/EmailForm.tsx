"use client";

import { useActionForm } from "@/components/useActionForm";
import { cancelMyEmailChange, changeMyEmail } from "../actions/settings";

/** Change the account email. Nothing changes until the new address confirms; the current one is told. */
export function EmailForm({ email, pending }: { email: string; pending: string | null }) {
  const [state, onSubmit, busy] = useActionForm(changeMyEmail, undefined);
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm">
        Signed in as <span className="font-bold">{email}</span>
      </p>
      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-lime/40 bg-lime/5 px-3 py-2 text-sm">
          <span>Waiting for {pending} to confirm. Check that inbox.</span>
          <form action={cancelMyEmailChange}>
            <button className="text-mute underline hover:text-bone">Cancel</button>
          </form>
        </div>
      )}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block space-y-1.5">
          <span className="label">New email</span>
          <input name="email" type="email" required className="input" autoComplete="email" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Your password</span>
          <input name="password" type="password" required className="input" autoComplete="current-password" />
        </label>
        <button className="btn-ghost btn-sm" disabled={busy}>
          {busy ? "Sending…" : "Change email"}
        </button>
      </form>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-lime">We sent a link to the new address. It changes once you click it (within 48 hours).</p>}
      <p className="text-xs text-mute">We&apos;ll also tell your current address, in case this wasn&apos;t you.</p>
    </div>
  );
}
