"use client";

import { useEffect, useRef, useState } from "react";

type Result = { ok?: boolean; error?: string; confirmed?: boolean };
const post = async (body: Record<string, unknown>): Promise<Result> => {
  try {
    const r = await fetch("/api/sender-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json().catch(() => ({}))) as Result;
  } catch {
    return { error: "Network error. Check your connection and try again." };
  }
};

/**
 * Senders without an account confirm their email with a code before anything uploads. Already confirmed in this
 * browser (30 days): nothing to do. Otherwise the code is emailed (this is where the bot check happens).
 * Returns null when they can send now, "code" when a code was emailed, or an error message.
 */
export async function startEmailCheck(email: string, turnstile: string): Promise<null | "code" | string> {
  const e = email.trim().toLowerCase();
  try {
    const r = (await (await fetch(`/api/sender-code?email=${encodeURIComponent(e)}`, { cache: "no-store" })).json()) as Result;
    if (r.confirmed) return null;
  } catch {}
  const sent = await post({ action: "send", email: e, turnstile });
  return sent.ok ? "code" : sent.error || "Couldn't send the code. Please try again.";
}

/**
 * The confirm screen after Send, in place of the form (which stays filled in behind it): what's being sent and to
 * whom, then the 6-digit code. "Back" returns to the form as it was.
 */
export function EmailCode({ email, receiverName, sending, onConfirmed, onCancel }: {
  email: string;
  receiverName: string;
  /** Track titles (or the folder name) being sent. */
  sending: string[];
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Smooth only for people who haven't asked their device for less motion.
    top.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  async function confirm() {
    if (code.replace(/\D/g, "").length !== 6) return setNote({ text: "Enter the 6-digit code.", error: true });
    setBusy(true);
    const r = await post({ action: "check", email, code });
    setBusy(false);
    if (r.ok) onConfirmed();
    else setNote({ text: r.error || "That code didn't go through. Check the 6 digits, or send a new code.", error: true });
  }

  async function resend() {
    setBusy(true);
    const r = await post({ action: "resend", email });
    setBusy(false);
    setCode("");
    setNote(r.ok ? { text: "New code sent.", error: false } : { text: r.error || "Couldn't send a new code.", error: true });
  }

  return (
    <div ref={top} role="group" aria-labelledby="email-code-title" className="scroll-mt-6 space-y-5">
      <button type="button" onClick={onCancel} disabled={busy} className="inline-flex min-h-11 items-center text-sm text-mute hover:text-bone">
        ← Back to your details
      </button>
      <div>
        <p className="eyebrow">One last step</p>
        <h2 id="email-code-title" className="mt-1 text-2xl font-bold">Check your email</h2>
        <p className="mt-2 text-sm text-mute">
          We sent a 6-digit code to <span className="break-all text-bone">{email}</span>. Enter it to send to {receiverName}. This browser remembers your email for 30 days.
        </p>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-ink-2 text-sm">
        {sending.map((t, i) => (
          <li key={i} className="truncate px-4 py-2.5">
            {t}
          </li>
        ))}
      </ul>
      <div className="space-y-3">
        <input
          aria-label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), confirm())}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          className="input w-full text-center text-2xl tracking-[0.4em] tnum"
        />
        <button type="button" onClick={confirm} disabled={busy} className="btn-lime min-h-12 w-full font-bold">
          {busy ? "Checking…" : `Confirm and send to ${receiverName}`}
        </button>
        {note && (
          <p role={note.error ? "alert" : "status"} className={`text-sm ${note.error ? "text-danger" : "text-lime"}`}>
            {note.text}
          </p>
        )}
        <p className="text-sm text-mute">
          No email?{" "}
          <button type="button" onClick={resend} disabled={busy} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-bone">
            Send a new code
          </button>{" "}
          or check your spam folder.
        </p>
      </div>
    </div>
  );
}
