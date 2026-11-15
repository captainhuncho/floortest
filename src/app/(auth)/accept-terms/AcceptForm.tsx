"use client";
import { useActionState } from "react";
import { acceptTerms } from "./actions";

/** One checkbox and one button. The hidden field is the hash of the Terms text shown, so a change mid-way is caught. */
export function AcceptForm({ hash }: { hash: string }) {
  const [state, action, pending] = useActionState(acceptTerms, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="version" value={hash} />
      <label className="af-cbr">
        <input type="checkbox" name="tick" required aria-describedby={state?.error ? "accept-issue" : undefined} />
        <span>
          I have read, understood and agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener" className="underline underline-offset-4">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-4">
            Privacy Policy
          </a>
          , including that music I send may be played by the receiver.
        </span>
      </label>
      {state?.error && (
        <p id="accept-issue" role="alert" className="af-alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="af-btn af-prime" disabled={pending}>
        {pending ? "Saving…" : "Accept and continue"}
      </button>
    </form>
  );
}
