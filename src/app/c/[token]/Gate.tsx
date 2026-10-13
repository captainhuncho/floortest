"use client";

import { useActionState, useState } from "react";
import { acceptNotice, askToJoin, checkCode, sendCode, type GateState } from "./actions";

/**
 * The door to a private collection, one step at a time: your email → the 6-digit code → the access notice (if you're
 * on the list) or a request to join (if you're not). Signed-in account holders with a confirmed email skip the code.
 */
export function Gate({ secret, ownerName, notice, initial, initialEmail }: { secret: string; ownerName: string; notice: string; initial: NonNullable<GateState>["step"]; initialEmail?: string }) {
  const [state, setState] = useState<NonNullable<GateState>>({ step: initial, email: initialEmail });
  const [sent, send, sending] = useActionState(sendCode.bind(null, secret), null);
  const [checked, check, checking] = useActionState(checkCode.bind(null, secret), null);
  const [accepted, accept, accepting] = useActionState(acceptNotice.bind(null, secret), null);
  const [asked, ask, asking] = useActionState(askToJoin.bind(null, secret), null);
  // Each answer from the server moves the door to its next step.
  const answers = [sent, checked, accepted, asked];
  const [seen, setSeen] = useState(answers);
  if (answers.some((a, i) => a !== seen[i])) {
    const next = answers.find((a, i) => a && a !== seen[i]);
    setSeen(answers);
    if (next) setState(next);
  }

  const box = "mt-6 flex flex-col gap-3";
  const error = state.error && (
    <p role="alert" className="text-[13px] text-danger">
      {state.error}
    </p>
  );

  if (state.step === "email")
    return (
      <form action={send} className={box}>
        <p className="text-[14px] text-mute">Enter your email. If {ownerName} added you, you&apos;ll get a code to open the collection. If not, you can ask for access.</p>
        <label htmlFor="g-email" className="sr-only">
          Email
        </label>
        <input id="g-email" name="email" type="email" required autoComplete="email" defaultValue={state.email} placeholder="you@example.com" className="input" />
        {error}
        <button disabled={sending} className="btn-lime">
          {sending ? "Sending…" : "Email me a code"}
        </button>
      </form>
    );

  if (state.step === "code")
    return (
      <form action={check} className={box}>
        <p className="text-[14px] text-mute">We sent a 6-digit code to {state.email}. It works for 10 minutes.</p>
        <input type="hidden" name="email" value={state.email} />
        <label htmlFor="g-code" className="sr-only">
          Code
        </label>
        <input id="g-code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} placeholder="123456" className="input tnum tracking-[0.3em]" />
        {error}
        <button disabled={checking} className="btn-lime">
          {checking ? "Checking…" : "Continue"}
        </button>
        <button type="button" className="text-[13px] text-mute underline underline-offset-4 tap-text" onClick={() => setState({ step: "email", email: state.email })}>
          Use a different email
        </button>
      </form>
    );

  if (state.step === "notice")
    return (
      <form action={accept} className={box}>
        <div className="rounded-lg border border-line bg-ink-2 p-4 text-[13px] leading-relaxed text-bone">
          {notice}{" "}
          <a href="/privacy" target="_blank" className="underline underline-offset-4">
            Privacy Policy
          </a>
        </div>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" name="agree" required className="mt-0.5 size-4 accent-lime" />
          <span>I understand and agree.</span>
        </label>
        {error}
        <button disabled={accepting} className="btn-lime">
          {accepting ? "Opening…" : "Open the collection"}
        </button>
      </form>
    );

  if (state.step === "request")
    return (
      <form action={ask} className={box}>
        <p className="text-[14px] text-mute">You&apos;re not on the list for this collection. Ask {ownerName} for access?</p>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-mute">Your name</span>
          <input name="name" required maxLength={80} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-mute">A note (optional)</span>
          <input name="note" maxLength={300} placeholder="e.g. Sam, A&R at Defected" className="input" />
        </label>
        {error}
        <button disabled={asking} className="btn-lime">
          {asking ? "Sending…" : "Ask for access"}
        </button>
      </form>
    );

  if (state.step === "sent" || state.step === "waiting")
    return (
      <p role="status" className="mt-6 rounded-lg border border-lime/40 bg-lime/[0.06] p-4 text-[14px]">
        {state.step === "sent" ? `Request sent. We'll email ${state.email} when ${ownerName} answers.` : `Your request is waiting for ${ownerName}. We'll email you when they answer.`}
      </p>
    );

  return (
    <div className="mt-6 flex flex-col gap-3">
      <p role="status" className="text-[14px] text-mute">
        {state.error || "You don't have access to this collection."}
      </p>
    </div>
  );
}
