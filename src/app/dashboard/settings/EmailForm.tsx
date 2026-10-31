"use client";

import { useActionForm } from "@/components/useActionForm";
import { Icon } from "@/components/Kit";
import { cancelMyEmailChange, changeMyEmail } from "../actions/settings";
import { BTN, FIELD, HELP, Notice, WELL } from "./ui";

/** Change the account email. Nothing changes until the new address confirms; the current one is told. */
export function EmailForm({ email, pending, twoFactor }: { email: string; pending: string | null; twoFactor: boolean }) {
  const [state, onSubmit, busy] = useActionForm(changeMyEmail, undefined);
  return (
    <div className="flex flex-col gap-4">
      <p className={`${WELL} flex min-w-0 items-center gap-2.5 px-3.5 py-3 text-[12.5px] text-mute`}>
        <Icon name="mail" className="size-4" />
        <span className="min-w-0 truncate">
          Signed in as <span className="font-semibold text-bone">{email}</span>
        </span>
      </p>
      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-well px-3.5 py-2 text-[12.5px]">
          <span className="min-w-0 text-bone">
            Waiting for {pending} to confirm. <span className="text-mute">Check that inbox for our link.</span>
          </span>
          <form action={cancelMyEmailChange}>
            <button className="inline-flex min-h-11 items-center text-mute underline underline-offset-4 hover:text-bone">Cancel</button>
          </form>
        </div>
      )}
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <label className="flex flex-col gap-1.5">
          <span className={FIELD}>New email</span>
          <input name="email" type="email" required className="input" autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={FIELD}>Your password</span>
          <input name="password" type="password" required className="input" autoComplete="current-password" />
        </label>
        {twoFactor && (
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Two-step code</span>
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit or recovery code" className="input" />
          </label>
        )}
        <div className="flex flex-col gap-3 sm:col-span-2">
          {state?.error && (
            <Notice tone="error" next="Your email hasn't changed. Fix that and try again.">
              {state.error}
            </Notice>
          )}
          {state?.ok && (
            <Notice tone="ok" next="Open the email we sent to the new address and click the link within 48 hours.">
              We sent a link to the new address. It changes once you click it.
            </Notice>
          )}
          <button className={`${BTN} w-full sm:w-fit`} disabled={busy}>
            {busy ? "Sending…" : "Change email"}
          </button>
          <p className={HELP}>We&apos;ll also tell your current address, in case this wasn&apos;t you.</p>
        </div>
      </form>
    </div>
  );
}
