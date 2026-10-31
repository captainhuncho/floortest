"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { useState, useTransition } from "react";
import { useBrowserValue } from "@/components/useBrowserValue";
import { passkeyProblem, passkeysHere } from "@/lib/passkey-browser";
import type { FormState } from "./actions";

/**
 * "Sign in with a passkey" (on /login) or "Use a passkey instead" (on the two-step page). Asks the server for a
 * one-time challenge, lets the browser show its passkey prompt, then sends the answer back; the server signs in and
 * redirects. Hidden in the apps and in browsers without passkeys.
 */
export function PasskeyButton({
  label,
  begin,
  finish,
  className = "af-btn",
}: {
  label: string;
  begin: () => Promise<PublicKeyCredentialRequestOptionsJSON | null>;
  finish: (answer: unknown) => Promise<FormState>;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = useBrowserValue(passkeysHere, false);
  if (!shown) return null;
  return (
    <div>
      <button
        type="button"
        className={`${className} min-h-11`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const options = await begin();
            if (!options) return setError("Passkeys aren't available right now. Use your password or an email code.");
            let answer;
            try {
              answer = await startAuthentication({ optionsJSON: options });
            } catch (e) {
              return setError(passkeyProblem(e));
            }
            const r = await finish(answer);
            if (r?.error) setError(r.error);
          })
        }
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21v-1a6 6 0 0 1 9.5-4.9" />
          <circle cx="18" cy="14" r="2.5" />
          <path d="M18 16.5V22m0-2h2" />
        </svg>
        {pending ? "Waiting for your passkey…" : label}
      </button>
      {error && (
        <p role="alert" className="af-issue text-center">
          {error}
        </p>
      )}
    </div>
  );
}
