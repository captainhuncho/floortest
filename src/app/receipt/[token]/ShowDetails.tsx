"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestReceiptCode, verifyReceiptCode, type CodeState } from "./actions";

/**
 * "Show my details" on a receipt opened with the link alone (owner, 2 Nov). Emails a code to the sender's own
 * address (from the receipt, never typed), then takes the 6 digits. Gets only the token and the masked address:
 * nothing private reaches the browser before the code is right.
 */
export function ShowDetails({ token, masked }: { token: string; masked: string }) {
  const router = useRouter();
  const [asked, setAsked] = useState<string | null>(null);
  const [asking, ask] = useTransition();
  const [state, verify, checking] = useActionState<CodeState, FormData>(async (prev, form) => {
    const next = await verifyReceiptCode(token, prev, form);
    if (next?.done) router.refresh();
    return next;
  }, null);

  if (state?.done) return <p role="status" className="text-[13px] text-mute">Code confirmed. Showing your details…</p>;
  if (!asked)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] leading-5 text-mute">
          The track, who it went to and their note show only to you. We&apos;ll email a code to <span className="text-bone">{masked}</span>.
        </p>
        <button
          type="button"
          disabled={asking}
          onClick={() => ask(async () => setAsked((await requestReceiptCode(token))?.sent ?? masked))}
          className="btn-lime min-h-12 w-full rounded-[13px] px-5 text-[14px] sm:w-fit"
        >
          {asking ? "Sending…" : "Show my details"}
        </button>
      </div>
    );
  return (
    <form action={verify} className="flex flex-col gap-2.5">
      <p role="status" className="text-[13px] leading-5 text-mute">
        We sent a code to <span className="text-bone">{asked}</span>. It works for 10 minutes.
      </p>
      <input
        name="code"
        aria-label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        placeholder="123456"
        className="input min-h-14 w-full rounded-[13px] text-center text-2xl! font-semibold tracking-[0.4em] tnum sm:max-w-[16rem]"
      />
      {state?.error && (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={checking} className="btn-lime min-h-12 rounded-[13px] px-5 text-[14px]">
          {checking ? "Checking…" : "Show my details"}
        </button>
        <button type="button" disabled={asking} onClick={() => ask(async () => setAsked((await requestReceiptCode(token))?.sent ?? masked))} className="min-h-11 text-[13px] text-mute underline underline-offset-4">
          Send a new code
        </button>
      </div>
    </form>
  );
}
