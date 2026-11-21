"use client";

import { useActionForm } from "@/components/useActionForm";
import { Turnstile } from "@/components/Turnstile";
import { askReopenAlert } from "./reopen-actions";

/** On a closed, full or paused link: leave an email and hear once when it reopens. */
export function ReopenAlert({ handle, receiverName, botCheckKey }: { handle: string; receiverName: string; botCheckKey: string | null }) {
  const [state, onSubmit, pending] = useActionForm(askReopenAlert, undefined);
  if (state?.ok)
    return (
      <p role="status" className="rounded-xl border border-line bg-well px-4 py-3 text-[13px]">
        Check your inbox: confirm your address there and you&apos;ll get one email when {receiverName}&apos;s link is open again.
      </p>
    );
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-2.5" aria-label="Email me when it reopens">
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <input type="hidden" name="handle" value={handle} />
      <label htmlFor="reopen-email" className="text-[12px] text-mute">
        Your email
      </label>
      <input id="reopen-email" name="email" type="email" required autoComplete="email" maxLength={200} placeholder="you@example.com" className="input w-full" />
      <Turnstile action="reopen" siteKey={botCheckKey} />
      <button className="btn-lime min-h-12 w-full rounded-full text-[15px] font-bold" disabled={pending}>
        {pending ? "Sending…" : "Email me when it reopens"}
      </button>
      {state?.error && (
        <p role="alert" className="text-[12px] text-danger">
          {state.error}
        </p>
      )}
      <p className="text-[12px] text-dim">We&apos;ll ask you to confirm, then send one email, nothing else. Your address isn&apos;t shown to {receiverName}.</p>
    </form>
  );
}
