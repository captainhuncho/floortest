"use client";

import { useRef } from "react";
import { useActionForm } from "@/components/useActionForm";
import { login } from "../(auth)/actions";

/** A small sign-in pop-up for people who already have an account, so the gate never shows the full sign-in page. */
export function SignInDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, onSubmit, pending] = useActionForm(login, undefined);
  return (
    <>
      <p className="text-sm text-mute">
        Already have an account?{" "}
        <button type="button" onClick={() => dialog.current?.showModal()} className="inline-flex min-h-11 items-center text-bone underline underline-offset-4 hover:text-lime">
          Sign in
        </button>
      </p>
      <dialog
        ref={dialog}
        aria-labelledby="signin-title"
        className="m-auto w-[min(92vw,24rem)] rounded-2xl border border-line-2 bg-ink-2 p-6 text-bone backdrop:bg-black/80"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="signin-title" className="text-lg font-semibold">
              Sign in
            </h2>
            <button type="button" aria-label="Close" onClick={() => dialog.current?.close()} className="grid size-11 place-items-center text-mute hover:text-bone">
              ×
            </button>
          </div>
          <label className="block space-y-1.5">
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="username" autoFocus className="input" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className="input" />
          </label>
          {state?.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          <button className="btn-lime min-h-11 w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </dialog>
    </>
  );
}
