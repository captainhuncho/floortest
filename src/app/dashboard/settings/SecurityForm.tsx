"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useActionForm } from "@/components/useActionForm";
import { changePassword, signOutDevice, signOutOtherDevices } from "../actions/security";
import { PasswordStrength } from "@/components/PasswordStrength";

export type Device = { hash: string; device: string; app: boolean; current: boolean; signedIn: string; lastUsed: string | null };

export function SecurityForm({ devices, context = [], twoFactor }: { devices: Device[]; context?: string[]; twoFactor: boolean }) {
  const [pw, setPw] = useState("");
  const [state, onSubmit, pending] = useActionForm(changePassword, undefined);
  const [list, setList] = useState(devices);
  const [busy, start] = useTransition();
  const toast = useToast();
  const others = list.filter((d) => !d.current).length;

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
          <input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
          <PasswordStrength value={pw} context={context} />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Repeat new password</span>
          <input className="input" type="password" name="confirm" required minLength={8} autoComplete="new-password" />
        </label>
        {twoFactor && <label className="block space-y-1.5">
          <span className="label">Two-step code</span>
          <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit or recovery code" className="input" />
        </label>}
        <div className="flex items-center gap-3 sm:col-span-3">
          <button className="btn-lime btn-sm min-h-11" disabled={pending}>
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

      <div className="space-y-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-mute">
            {others ? `Signed in on ${others} other device${others === 1 ? "" : "s"}.` : "Only signed in on this device."} A browser that isn&apos;t used for 14 days is signed out by itself.
          </p>
          <button
            className="btn-ghost btn-sm"
            disabled={!others || busy}
            onClick={() =>
              start(async () => {
                const n = await signOutOtherDevices();
                setList((l) => l.filter((d) => d.current));
                toast.show({ message: n ? `Signed out ${n} other device${n === 1 ? "" : "s"}` : "No other devices were signed in" });
              })
            }
          >
            Sign out other devices
          </button>
        </div>
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Devices signed in">
          {list.map((d) => (
            <li key={d.hash} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-bone">
                  {d.device}
                  {d.app && <span className="ml-2 rounded-sm bg-ink px-1.5 py-0.5 text-[11px] text-mute">FloorTest app</span>}
                  {d.current && <span className="ml-2 rounded-sm bg-lime/15 px-1.5 py-0.5 text-[11px] text-lime">This device</span>}
                </p>
                <p className="text-xs text-mute">
                  Signed in {d.signedIn}
                  {d.lastUsed && d.lastUsed !== d.signedIn ? ` · last used ${d.lastUsed}` : ""}
                </p>
              </div>
              {!d.current && (
                <button
                  className="btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r = await signOutDevice(d.hash);
                      if ("error" in r) return toast.show({ message: r.error });
                      setList((l) => l.filter((x) => x.hash !== d.hash));
                      toast.show({ message: `Signed out ${d.device}` });
                    })
                  }
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
