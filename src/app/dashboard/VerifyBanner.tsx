"use client";

import { useState, useTransition } from "react";
import { resendEmailVerification } from "../(auth)/actions";

/** Until the receiver confirms their email, resets and alerts may not reach them. */
export function VerifyBanner({ email }: { email: string }) {
  const [sent, setSent] = useState<null | boolean>(null);
  const [pending, start] = useTransition();
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-lime/30 bg-lime/[0.07] px-4 py-2.5 text-sm sm:px-6">
      <span>
        Confirm <span className="font-medium">{email}</span> so password resets and alerts reach you. Check your inbox for the link.
      </span>
      <button
        type="button"
        className="min-h-6 font-medium text-lime underline-offset-4 hover:underline disabled:opacity-50"
        disabled={pending || sent === true}
        onClick={() => start(async () => setSent(await resendEmailVerification()))}
      >
        {sent === true ? "Sent. Check your inbox" : sent === false ? "Try again later" : "Resend the link"}
      </button>
    </div>
  );
}
