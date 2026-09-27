"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useActionForm } from "@/components/useActionForm";
import { changePassword, signOutOtherDevices } from "../actions";

export function SecurityForm({ otherSessions }: { otherSessions: number }) {
  const [state, onSubmit, pending] = useActionForm(changePassword, undefined);
  const [others, setOthers] = useState(otherSessions);
  const [signingOut, start] = useTransition();
  const toast = useToast();

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          onSubmit(e);
        }}
        className="grid gap-4 sm:grid-cols-3"
      >
        <label className="block space-y-1.5">
          <span className="label">Current password</span>
          <input className="input" type="password" name="current" required autoComplete="current-password" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">New password</span>
          <input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Repeat new password</span>
          <input className="input" type="password" name="confirm" required minLength={8} autoComplete="new-password" />
        </label>
        <div className="flex items-center gap-3 sm:col-span-3">
          <button className="btn-lime btn-sm" disabled={pending}>
            {pending ? "Saving…" : "Change password"}
          </button>
          {state?.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p role="status" className="text-sm text-lime">
              Password changed. Other devices were signed out.
            </p>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-mute">
          {others ? `Signed in on ${others} other device${others === 1 ? "" : "s"}.` : "Only signed in on this device."}
        </p>
        <button
          className="btn-ghost btn-sm"
          disabled={!others || signingOut}
          onClick={() =>
            start(async () => {
              const n = await signOutOtherDevices();
              setOthers(0);
              toast.show({ message: n ? `Signed out ${n} other device${n === 1 ? "" : "s"}` : "No other devices were signed in" });
            })
          }
        >
          Sign out other devices
        </button>
      </div>
    </div>
  );
}
