"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState, useTransition } from "react";
import { useBrowserValue } from "@/components/useBrowserValue";
import { useToast } from "@/components/Toast";
import { passkeyProblem, passkeysHere } from "@/lib/passkey-browser";
import { deletePasskey, finishAddPasskey, startAddPasskey } from "../actions/passkeys";
import { ConfirmItsYou } from "./ConfirmItsYou";
import { Chip, Icon } from "@/components/Kit";
import { BTN, BTN_GHOST, HELP, Notice, ROW, WELL } from "./ui";
import { Fold } from "./Fold";

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
    <div className="flex flex-col gap-4">
      <p className="max-w-[62ch] text-[12.5px] leading-snug text-mute">
        Sign in with your face, fingerprint or device PIN instead of a password. A passkey also counts as your two-step
        sign-in. It lives on your device or in your password manager (iCloud Keychain, Google Password Manager, 1Password).
      </p>
      {keys.length > 0 && (
        <Fold title="Your passkeys" count={keys.length} lead={keys.map((k) => k.name).join(", ")}>
        <ul>
          {keys.map((k) => (
            <li key={k.id} className={ROW}>
              <div className="flex min-w-0 flex-1 basis-52 items-center gap-2.5">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-card text-mute">
                  <Icon name="lock" className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-bone">
                    {k.name}
                    {k.synced && <Chip>Synced</Chip>}
                  </p>
                  <p className="text-[11.5px] text-mute">
                    Added {k.added}, {k.lastUsed ? `last used ${k.lastUsed}` : "not used yet"}
                    {k.synced ? ". Works on your other devices too" : ""}
                  </p>
                </div>
              </div>
              {removing !== k.id && (
                <button
                  className={BTN_GHOST}
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
        </Fold>
      )}
      {supported === false && (
        <Notice tone="info" next="Open FloorTest in Safari, Chrome, Edge or Firefox to add one.">
          This browser or app can&apos;t make passkeys.
        </Notice>
      )}
      {supported && !adding && keys.length < max && (
        <button className={`${BTN} w-full sm:w-fit`} onClick={() => setAdding(true)}>
          Add a passkey
        </button>
      )}
      {supported && keys.length >= max && (
        <Notice tone="info" next="Remove one to add another.">
          You have {max} passkeys, the most an account can have.
        </Notice>
      )}
      {adding && (
        <form
          className={`${WELL} flex flex-col gap-3 p-3.5 sm:p-4`}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <p className="text-[13px] text-bone">First, confirm it&apos;s you. Then your browser asks where to save the passkey.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="input sm:max-w-60"
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
                className="input font-mono tracking-widest sm:max-w-44"
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
            <Notice tone="error" next="No passkey was added. Fix that and press Continue again.">
              {error}
            </Notice>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className={BTN} disabled={pending}>
              {pending ? "Waiting for your passkey…" : "Continue"}
            </button>
            <button
              type="button"
              className={BTN_GHOST}
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          <p className={HELP}>No password? Set one with &ldquo;Forgot your password?&rdquo; on the log-in page first.</p>
        </form>
      )}
    </div>
  );
}
