"use client";

import { useState, useTransition } from "react";
import { resendEmailVerification } from "../(auth)/actions";

/** Sends the confirmation email again; used by the banner and the Floor's checklist step. */
export function ResendVerification({ className = "" }: { className?: string }) {
  const [sent, setSent] = useState<null | boolean>(null);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`tap min-h-6 w-fit font-medium text-lime underline-offset-4 hover:underline disabled:opacity-50 ${className}`}
      disabled={pending || sent === true}
      onClick={() => start(async () => setSent(await resendEmailVerification()))}
    >
      {sent === true ? "Sent. Check your email." : sent === false ? "Try again later" : "Resend email"}
    </button>
  );
}

/**
 * Until the receiver confirms their email, resets and alerts may not reach them. Shown on the Floor and Send only
 * (each page renders it), not on every screen.
 */
export function VerifyBanner({ email }: { email: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-lime/30 bg-lime/[0.07] px-4 py-2.5 text-sm sm:px-6">
      <span className="min-w-0">
        Confirm <span className="font-medium">{email}</span> so alerts and password resets reach you.
      </span>
      <ResendVerification />
    </div>
  );
}
