"use client";

import { useActionForm } from "@/components/useActionForm";
import { useRef, useState } from "react";
import { deleteAccount } from "../actions/settings";

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
      <button type="button" className="btn btn-sm min-h-11 border border-danger/50 text-danger hover:bg-danger/10" onClick={() => dialog.current?.showModal()}>
        Delete my account…
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-title"
        onClose={() => setTyped("")}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-danger/40 bg-ink-2 p-5 text-bone backdrop:bg-black/70"
      >
    <form onSubmit={onSubmit} className="space-y-3">
      <h2 id="delete-title" className="text-lg font-semibold text-danger">
        Delete your account?
      </h2>
      <p className="text-sm">
        This permanently deletes your link, every track and file you&apos;ve received, your contacts and all history. Senders&apos; receipts
        stop working. It can&apos;t be undone.
      </p>
      <label className="block space-y-1.5">
        <span className="label">Type your link name ({handle}) to confirm</span>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Password</span>
        <input className="input" type="password" name="password" required autoComplete="current-password" />
      </label>
      {twoFactor && (
        <label className="block space-y-1.5">
          <span className="label">Two-step code</span>
          <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit or recovery code" className="input" />
        </label>
      )}
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" autoFocus className="btn-ghost btn-sm min-h-11" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-sm min-h-11 bg-danger font-semibold text-ink hover:bg-danger/90" disabled={pending || typed.trim().toLowerCase() !== handle}>
          {pending ? "Deleting…" : "Delete everything"}
        </button>
      </div>
    </form>
      </dialog>
    </>
  );
}
