"use client";

import { useEffect, useRef, useState } from "react";
import { normalEmail } from "@/lib/email-normal";

type Result = { ok?: boolean; error?: string; confirmed?: boolean; termsNeeded?: boolean; termsHash?: string };
/** What the server says about the Terms for the confirmed email: the hash to send back when a tick is needed. */
export type TermsState = { termsNeeded?: boolean; termsHash?: string };
const post = async (body: Record<string, unknown>): Promise<Result> => {
  try {
    const r = await fetch("/api/sender-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json().catch(() => ({}))) as Result;
  } catch {
    return { error: "You're offline or the connection dropped. Reconnect and try again." };
  }
};

/**
 * Senders without an account confirm their email with a code before anything uploads. Already confirmed in this
 * browser (30 days): nothing to do. Otherwise the code is emailed (this is where the bot check happens).
 * Returns the Terms state when they can send now, "code" when a code was emailed, or an error message.
 */
export async function startEmailCheck(email: string, turnstile: string): Promise<{ ready: TermsState } | "code" | string> {
  const e = normalEmail(email);
  try {
    const r = (await (await fetch(`/api/sender-code?email=${encodeURIComponent(e)}`, { cache: "no-store" })).json()) as Result;
    if (r.confirmed) return { ready: { termsNeeded: r.termsNeeded, termsHash: r.termsHash } };
  } catch {}
  const sent = await post({ action: "send", email: e, turnstile });
  return sent.ok ? "code" : sent.error || "The code didn't send. Check the email address and try again.";
}

const CODE_BOXES = [0, 1, 2, 3, 4, 5];

/**
 * The confirm step after Send, in place of the form (which stays filled in behind it): where the code went, what it
 * sends, then the 6-digit code. "Back" returns to the form as it was.
 */
export function EmailCode({ email, sending, onConfirmed, onCancel }: {
  email: string;
  receiverName: string;
  /** Track titles (or the folder name) being sent. */
  sending: string[];
  onConfirmed: (terms: TermsState) => void;
  onCancel: () => void;
}) {
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Smooth only for people who haven't asked their device for less motion.
    top.current?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  async function confirm() {
    if (code.replace(/\D/g, "").length !== 6) return setNote({ text: "Enter the 6-digit code.", error: true });
    setBusy(true);
    const r = await post({ action: "check", email, code });
    setBusy(false);
    if (r.ok) onConfirmed({ termsNeeded: r.termsNeeded, termsHash: r.termsHash });
    else setNote({ text: r.error || "That code didn't go through. Check the 6 digits, or send a new code.", error: true });
  }

  async function resend() {
    setBusy(true);
    const r = await post({ action: "resend", email });
    setBusy(false);
    setCode("");
    setNote(r.ok ? { text: "New code sent.", error: false } : { text: r.error || "Couldn't send a new code.", error: true });
  }

  // Typing always continues from the end, so the six boxes fill left to right.
  const toEnd = (e: React.SyntheticEvent<HTMLInputElement>) => e.currentTarget.setSelectionRange(6, 6);
  return (
    <div ref={top} role="group" aria-labelledby="email-code-title" className="my-auto flex scroll-mt-16 flex-col items-center gap-3 py-6 text-center">
      <h2 id="email-code-title" className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">Check your email</h2>
      <p className="max-w-[380px] text-[13px] leading-5 text-mute">
        We sent a 6-digit code to <span className="break-all font-semibold text-bone">{email}</span>. Enter it to send {sending.length === 1 ? sending[0] : `${sending.length} tracks`}. This browser remembers your email for 30 days.
      </p>
      {/* Six boxes to look at, one real field on top of them: paste and the phone's one-time-code fill land in a single input. */}
      <div className="relative flex gap-2">
        <input
          aria-label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), confirm())}
          onFocus={toEnd}
          onClick={toEnd}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          className="peer absolute inset-0 z-[1] h-full w-full cursor-text text-[16px] opacity-0"
        />
        {CODE_BOXES.map((i) => (
          <span
            key={i}
            aria-hidden
            className={`grid h-[54px] w-11 place-items-center rounded-xl border bg-well text-[20px] font-semibold text-bone tnum ${i === Math.min(code.length, 5) ? "border-line-2 peer-focus:border-bone peer-focus:outline peer-focus:outline-2 peer-focus:outline-offset-1 peer-focus:outline-lime" : "border-line"}`}
          >
            {code[i] ?? ""}
          </span>
        ))}
      </div>
      {note && (
        <p role={note.error ? "alert" : "status"} className={`text-[13px] ${note.error ? "text-danger" : "text-bone"}`}>
          {note.text}
        </p>
      )}
      <button type="button" onClick={confirm} disabled={busy} className="btn-lime min-h-12 w-full max-w-[380px] rounded-full text-[15px] font-bold">
        {busy ? "Checking…" : "Send"}
      </button>
      <button type="button" onClick={resend} disabled={busy} className="inline-flex min-h-11 items-center px-3 text-[14px] text-mute underline underline-offset-4 hover:text-bone">
        Send a new code
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="inline-flex min-h-11 items-center px-3 text-[13px] text-mute underline underline-offset-4 hover:text-bone">
        Back
      </button>
    </div>
  );
}
