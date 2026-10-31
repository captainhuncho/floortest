"use client";

import { useActionForm } from "@/components/useActionForm";
import { useRef, useState } from "react";
import { deleteAccount } from "../actions/settings";
import { BTN_DANGER, BTN_GHOST, FIELD, HELP, Notice, SettingLine } from "./ui";

export function DeleteAccount({ handle, twoFactor }: { handle: string; twoFactor: boolean }) {
  const [state, onSubmit, pending] = useActionForm(deleteAccount, undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const close = () => {
    dialog.current?.close();
    setTyped("");
  };
  return (
    <>
      <SettingLine title="Remove everything" sub="Want a copy first? Ask for your data from the Account page before you delete.">
        <button type="button" className={`${BTN_DANGER} w-full sm:w-auto`} onClick={() => dialog.current?.showModal()}>
          Delete my account…
        </button>
      </SettingLine>
      <dialog
        ref={dialog}
        aria-labelledby="delete-title"
        onClose={() => setTyped("")}
        className="dialog-box m-auto w-[min(92vw,28rem)] rounded-[18px] border-danger/40 p-5 backdrop:bg-black/70 sm:p-6"
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <h2 id="delete-title" className="text-[17px] font-semibold tracking-[-0.015em] text-danger">
              Delete your account?
            </h2>
            <p className="mt-1.5 text-[13px] leading-snug text-mute">
              This permanently deletes your link, every track and file you&apos;ve received, your contacts and all history. Senders&apos; receipts
              stop working. It can&apos;t be undone.
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Type your link name ({handle}) to confirm</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Password</span>
            <input className="input" type="password" name="password" required autoComplete="current-password" />
            <span className={HELP}>Signed up with Google or an email code? Set a password with &ldquo;Forgot your password?&rdquo; on the log-in page first.</span>
          </label>
          {twoFactor && (
            <label className="flex flex-col gap-1.5">
              <span className={FIELD}>Two-step code</span>
              <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit or recovery code" className="input" />
            </label>
          )}
          {state?.error && (
            <Notice tone="error" next="Nothing has been deleted. Check the details above and try again.">
              {state.error}
            </Notice>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <button type="button" autoFocus className={BTN_GHOST} onClick={close}>
              Cancel
            </button>
            <button className="btn btn-sm min-h-11 rounded-[12px] bg-danger px-4! text-ink hover:bg-danger/90" disabled={pending || typed.trim().toLowerCase() !== handle}>
              {pending ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
