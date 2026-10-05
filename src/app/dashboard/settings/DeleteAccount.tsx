"use client";

import { useActionForm } from "@/components/useActionForm";
import {useState} from "react";
import { deleteAccount } from "../actions/settings";

export function DeleteAccount({ handle }: { handle: string }) {
  const [state, onSubmit, pending] = useActionForm(deleteAccount, undefined);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  if (!open)
    return (
      <button className="btn btn-sm border border-danger/50 text-danger hover:bg-danger/10" onClick={() => setOpen(true)}>
        Delete my account…
      </button>
    );
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
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
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn btn-sm bg-danger font-semibold text-ink hover:bg-danger/90" disabled={pending || typed.trim().toLowerCase() !== handle}>
          {pending ? "Deleting…" : "Delete everything"}
        </button>
        <button type="button" className="btn btn-sm text-mute" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
