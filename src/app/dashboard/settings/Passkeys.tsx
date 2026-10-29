"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState, useTransition } from "react";
import { useBrowserValue } from "@/components/useBrowserValue";
import { useToast } from "@/components/Toast";
import { passkeyProblem, passkeysHere } from "@/lib/passkey-browser";
import { deletePasskey, finishAddPasskey, startAddPasskey } from "../actions/passkeys";
import { ConfirmItsYou } from "./ConfirmItsYou";

type Key = { id: number; name: string; added: string; lastUsed: string | null; synced: boolean };

/** Settings → Security: the account's passkeys, add one (password check first), remove one. */
export function Passkeys({ keys, twoFactor, max }: { keys: Key[]; twoFactor: boolean; max: number }) {
  const toast = useToast();
  // Unknown until the page is in the browser, so neither the button nor the "can't" line flashes up first.
  const here = useBrowserValue(() => (passkeysHere() ? "yes" : "no"), "unknown");
  const supported = here === "unknown" ? null : here === "yes";
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      setError(null);
      const step = await startAddPasskey(password, code);
      if ("error" in step) return setError(step.error ?? "That didn't work. Try again.");
      let answer;
      try {
        answer = await startRegistration({ optionsJSON: step.options });
      } catch (e) {
        return setError(passkeyProblem(e));
      }
      const r = await finishAddPasskey(answer);
      if ("error" in r) return setError(r.error);
      setAdding(false);
      setPassword("");
      setCode("");
      toast.show({ message: "Passkey added. Next time, choose Sign in with a passkey." });
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-mute">
        Sign in with your face, fingerprint or device PIN instead of a password. A passkey also counts as your two-step
        sign-in. It lives on your device or in your password manager (iCloud Keychain, Google Password Manager, 1Password).
      </p>
      {keys.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{k.name}</p>
                <p className="text-xs text-mute">
                  Added {k.added} · {k.lastUsed ? `last used ${k.lastUsed}` : "not used yet"}
                  {k.synced ? " · synced to your other devices" : ""}
                </p>
              </div>
              {removing !== k.id && (
                <button
                  className="btn-ghost btn-sm min-h-11"
                  onClick={() => {
                    setRemoving(k.id);
                    setRemoveError(null);
                  }}
                  aria-label={`Remove ${k.name}`}
                >
                  Remove…
                </button>
              )}
              {removing === k.id && (
                <ConfirmItsYou
                  className="basis-full"
                  twoFactor={twoFactor}
                  action={`Remove ${k.name}`}
                  pending={pending}
                  error={removeError}
                  onCancel={() => setRemoving(null)}
                  onConfirm={(password, code) =>
                    start(async () => {
                      const r = await deletePasskey(k.id, password, code);
                      if ("error" in r) return setRemoveError(r.error);
                      setRemoving(null);
                      toast.show({ message: `Removed ${k.name}.` });
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {supported === false && <p className="text-sm text-mute">This browser or app can&apos;t make passkeys. Open FloorTest in Safari, Chrome, Edge or Firefox to add one.</p>}
      {supported && !adding && keys.length < max && (
        <button className="btn-lime btn-sm min-h-11" onClick={() => setAdding(true)}>
          Add a passkey
        </button>
      )}
      {supported && keys.length >= max && <p className="text-sm text-mute">You have {max} passkeys, the most an account can have. Remove one to add another.</p>}
      {adding && (
        <form
          className="space-y-3 rounded-md border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <p className="text-sm">First, confirm it&apos;s you. Then your browser asks where to save the passkey.</p>
          <div className="flex flex-wrap gap-2">
            <input
              className="input max-w-60"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {twoFactor && (
              <input
                className="input max-w-44 font-mono tracking-widest"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Two-step code"
                aria-label="Two-step code"
                required
                maxLength={40}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button className="btn-lime btn-sm min-h-11" disabled={pending}>
              {pending ? "Waiting for your passkey…" : "Continue"}
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm min-h-11"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-mute">No password? Set one with &ldquo;Forgot your password?&rdquo; on the log-in page first.</p>
        </form>
      )}
    </div>
  );
}
