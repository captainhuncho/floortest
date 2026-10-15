"use client";

import { useActionForm } from "@/components/useActionForm";
import { requestSenderLink } from "./actions";
import { Turnstile } from "@/components/Turnstile";

export function SentForm({ botCheckKey }: { botCheckKey: string | null }) {
  const [state, onSubmit, pending] = useActionForm(requestSenderLink, undefined);
  if (state?.ok)
    return (
      <p role="status" className="card p-5">
        If you&apos;ve sent music through FloorTest from that address, a link is on its way. It works for 24 hours.
      </p>
    );
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="label">Your email</span>
        <input name="email" type="email" required autoComplete="email" className="input" placeholder="The one you send music from" />
      </label>
      <Turnstile action="sent" siteKey={botCheckKey} />
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button className="btn-lime w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me my link"}
      </button>
    </form>
  );
}
