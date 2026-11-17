"use client";

import { useActionState, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { requestReceiptCode, verifyReceiptCode, type CodeState } from "./actions";
import { Disc, MAIN, PinnedBar } from "./ReceiptParts";

/**
 * "Show my details" on a receipt opened with the link alone (owner, 2 Nov). Emails a code to the sender's own
 * address (from the receipt, never typed), then takes the 6 digits. Gets only the token and the masked address:
 * nothing private reaches the browser before the code is right.
 *
 * It wraps the receipt as the server rendered it for the link alone (`children`, then `foot`) and puts the button
 * in the bar at the bottom. Once a code is asked for, the code screen takes the receipt's place: short and centred,
 * the button still in the bar, kept above the on-screen keyboard.
 */
export function ShowDetails({ token, masked, children, foot }: { token: string; masked: string; children: ReactNode; foot: ReactNode }) {
  const router = useRouter();
  const [asked, setAsked] = useState<string | null>(null);
  const [asking, ask] = useTransition();
  const [tries, setTries] = useState(0);
  const [state, verify, checking] = useActionState<CodeState, FormData>(async (prev, form) => {
    const next = await verifyReceiptCode(token, prev, form);
    if (next?.done) router.refresh();
    else setTries((n) => n + 1);
    return next;
  }, null);
  const keyboard = useKeyboardInset();
  const sendCode = () => ask(async () => setAsked((await requestReceiptCode(token))?.sent ?? masked));

  if (state?.done)
    return (
      <div className="my-auto flex flex-col items-center gap-3 py-8 text-center">
        <Disc status="code" />
        <p role="status" className="text-[13px] text-mute">
          Code confirmed. Showing your details…
        </p>
      </div>
    );
  if (!asked)
    return (
      <>
        {children}
        <PinnedBar>
          <button type="button" disabled={asking} onClick={sendCode} className={MAIN}>
            {asking ? "Sending…" : "Show my details"}
          </button>
          <p className="pt-1 text-center text-[12px] leading-[18px] text-faint">Updates go to {masked}.</p>
        </PinnedBar>
        {foot}
      </>
    );
  return (
    <form action={verify} className="flex flex-1 flex-col" style={keyboard ? { paddingBottom: keyboard } : undefined}>
      <div className={`my-auto flex flex-col items-center gap-3 text-center ${keyboard ? "py-2" : "py-8"}`}>
        <Disc status="code" />
        <h1 className="mt-1 text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-bone">Check your email</h1>
        <p role="status" className="max-w-[34ch] text-pretty text-[13px] leading-[1.5] text-mute">
          We sent a 6-digit code to <span className="text-bone">{asked}</span>. It works for 10 minutes.
        </p>
        <CodeBoxes key={tries} />
        {state?.error && (
          <p role="alert" className="text-[13px] text-danger">
            {state.error}
          </p>
        )}
        <button type="button" disabled={asking} onClick={sendCode} className="min-h-11 px-3 text-[13px] text-mute underline underline-offset-4">
          Send a new code
        </button>
      </div>
      <PinnedBar lift={keyboard}>
        <button disabled={checking} className={MAIN}>
          {checking ? "Checking…" : "Show my details"}
        </button>
      </PinnedBar>
    </form>
  );
}

const DIGITS = 6;

/**
 * Six boxes, one field. The real input lies over the boxes with its own text hidden, so typing, pasting and the
 * phone's one-time-code suggestion all fill the six at once, and a screen reader meets a single "6-digit code" field.
 */
function CodeBoxes() {
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const next = Math.min(code.length, DIGITS - 1);
  return (
    <div className="relative grid w-full max-w-[304px] grid-cols-6 gap-1.5 rounded-[12px]">
      {Array.from({ length: DIGITS }, (_, i) => (
        <span key={i} aria-hidden className={`grid h-14 place-items-center rounded-[12px] border bg-card text-[20px] font-semibold text-bone tnum ${focused && i === next ? "border-bone" : "border-line-2"}`}>
          {code[i] ?? ""}
        </span>
      ))}
      <input
        name="code"
        aria-label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, DIGITS))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 size-full cursor-text rounded-[12px] bg-transparent text-[16px] text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  );
}

/**
 * How much of the bottom of the page the on-screen keyboard covers, in px (0 with no keyboard). Phones lay the
 * keyboard over the page without resizing it, so the bar at the bottom would sit under it; the visual viewport says
 * what is still in view. Pinch-zoom also shrinks the visual viewport, so a zoomed page counts as no keyboard.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const measure = () => setInset(view.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop)));
    view.addEventListener("resize", measure);
    view.addEventListener("scroll", measure);
    return () => {
      view.removeEventListener("resize", measure);
      view.removeEventListener("scroll", measure);
    };
  }, []);
  return inset;
}
