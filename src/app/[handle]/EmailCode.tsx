"use client";

import { useState } from "react";

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

/** The 6-digit code step, shown in place of the send button. */
export function EmailCode({ email, onConfirmed, onCancel, className = "" }: { email: string; onConfirmed: () => void; onCancel: () => void; className?: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  async function confirm() {
    if (code.replace(/\D/g, "").length !== 6) return setNote({ text: "Enter the 6-digit code.", error: true });
    setBusy(true);
    const r = await post({ action: "check", email, code });
    setBusy(false);
    if (r.ok) onConfirmed();
    else setNote({ text: r.error || "That didn't work. Please try again.", error: true });
  }

  async function resend() {
    setBusy(true);
    const r = await post({ action: "resend", email });
    setBusy(false);
    setCode("");
    setNote(r.ok ? { text: "New code sent.", error: false } : { text: r.error || "Couldn't send a new code.", error: true });
  }

  return (
    <div role="group" aria-labelledby="email-code-title" className={`space-y-3 rounded-xl border border-lime/40 bg-lime/5 p-4 ${className}`}>
      <div>
        <p id="email-code-title" className="font-semibold">Check your email</p>
        <p className="mt-1 text-sm text-mute">
          We sent a 6-digit code to <span className="break-all text-bone">{email}</span>. Enter it to send. This browser remembers your email for 30 days.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), confirm())}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          className="input w-full text-center text-lg tracking-[0.3em] tnum sm:w-40"
        />
        <button type="button" onClick={confirm} disabled={busy} className="btn-lime min-h-11 flex-1">
          {busy ? "Checking…" : "Confirm and send"}
        </button>
      </div>
      {note && (
        <p role={note.error ? "alert" : "status"} className={`text-sm ${note.error ? "text-danger" : "text-lime"}`}>
          {note.text}
        </p>
      )}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-mute">
        <button type="button" onClick={resend} disabled={busy} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-bone">
          Send a new code
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-bone">
          Change email
        </button>
      </p>
    </div>
  );
}
