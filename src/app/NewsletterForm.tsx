"use client";

import Link from "next/link";
import { useActionForm } from "@/components/useActionForm";
import { SourceField } from "@/components/SourceField";
import { Turnstile } from "@/components/Turnstile";
import { joinNewsletter } from "./newsletter/actions";

/** Footer newsletter sign-up: email, an optional offers box, then a confirmation email (double opt-in). */
export function NewsletterForm({ botCheckKey }: { botCheckKey: string | null }) {
  const [state, onSubmit, pending] = useActionForm(joinNewsletter, undefined);
  if (state?.ok)
    return (
      <p role="status" className="text-sm text-bone">
        Check your inbox: we&apos;ve sent a link to confirm your sign-up.
      </p>
    );
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="flex gap-2">
        <input name="email" type="email" required maxLength={200} placeholder="Your email" aria-label="Email for the newsletter" className="input min-w-0 flex-1" />
        <button className="btn-ghost btn-sm shrink-0" disabled={pending}>
          {pending ? "…" : "Subscribe"}
        </button>
      </div>
      <label className="flex items-start gap-2 text-xs text-mute">
        <input type="checkbox" name="offers" className="mt-0.5 accent-lime" />
        Also send me offers and promotions. Optional.
      </label>
      <p className="text-xs text-dim">
        Product news and tips, about once a month. Unsubscribe any time. See our <Link href="/privacy" className="underline underline-offset-4 hover:text-bone">Privacy Policy</Link>.
      </p>
      <Turnstile action="newsletter" siteKey={botCheckKey} />
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <SourceField />
    </form>
  );
}
