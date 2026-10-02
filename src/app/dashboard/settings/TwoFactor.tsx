"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useActionForm } from "@/components/useActionForm";
import { confirmTwoFactor, disableTwoFactor, setSigninAlerts, startTwoFactor } from "../actions";

/** Optional account protections the holder chooses: authenticator-app sign-in and sign-in alerts. */
export function TwoFactor({ enabled, alerts }: { enabled: boolean; alerts: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(enabled);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [alertsOn, setAlertsOn] = useState(alerts);
  const [pending, start] = useTransition();
  const [offState, submitOff, offPending] = useActionForm(disableTwoFactor, undefined);
  const [confirmOff, setConfirmOff] = useState(false);

  if (offState?.ok && on) setOn(false);

  return (
    <div className="space-y-6">
      {/* Two-factor */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              Two-factor sign-in{" "}
              <span className={`chip ml-1 ${on ? "border-lime/60 text-lime" : "border-line text-mute"}`}>{on ? "On" : "Off"}</span>
            </p>
            <p className="text-sm text-mute">A code from an authenticator app (Google Authenticator, 1Password, Authy) after your password.</p>
          </div>
          {!on && !setup && (
            <button
              className="btn-lime btn-sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setSetup(await startTwoFactor());
                })
              }
            >
              Set up
            </button>
          )}
          {on && !codes && !confirmOff && (
            <button className="btn-ghost btn-sm" onClick={() => setConfirmOff(true)}>
              Turn off…
            </button>
          )}
        </div>

        {setup && !codes && (
          <div className="mt-4 grid gap-5 rounded-md border border-line p-4 sm:grid-cols-[auto_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-sm" />
            <div className="space-y-3">
              <p className="text-sm">1. Scan this with your authenticator app, or type the key in by hand:</p>
              <p className="break-all rounded-sm bg-ink px-3 py-2 font-mono text-xs">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
              <p className="text-sm">2. Enter the 6-digit code it shows:</p>
              <div className="flex gap-2">
                <input
                  className="input max-w-40 font-mono tracking-widest"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="6-digit code"
                />
                <button
                  className="btn-lime btn-sm"
                  disabled={pending || code.replace(/\s/g, "").length !== 6}
                  onClick={() =>
                    start(async () => {
                      const r = await confirmTwoFactor(code);
                      if (r.error) return setError(r.error);
                      setCodes(r.codes ?? []);
                      setOn(true);
                      setSetup(null);
                      toast.show({ message: "Two-factor sign-in is on" });
                    })
                  }
                >
                  Turn on
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setSetup(null)}>
                  Cancel
                </button>
              </div>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
            </div>
          </div>
        )}

        {codes && (
          <div className="mt-4 rounded-md border border-lime/40 bg-lime/[0.05] p-4">
            <p className="font-medium">Save your recovery codes</p>
            <p className="mt-1 text-sm text-mute">
              If you lose your phone, each of these works once instead of a code. They won&apos;t be shown again, so store them in your password
              manager.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5">
              {codes.map((c) => (
                <li key={c} className="rounded-sm bg-ink px-2 py-1.5 text-center">
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(codes.join("\n"));
                  toast.show({ message: "Recovery codes copied" });
                }}
              >
                Copy codes
              </button>
              <button className="btn-lime btn-sm" onClick={() => setCodes(null)}>
                I&apos;ve saved them
              </button>
            </div>
          </div>
        )}

        {on && confirmOff && (
          <form onSubmit={submitOff} className="mt-4 grid gap-3 rounded-md border border-line p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block space-y-1.5">
              <span className="label">Password</span>
              <input className="input" type="password" name="password" required autoComplete="current-password" />
            </label>
            <label className="block space-y-1.5">
              <span className="label">Code or recovery code</span>
              <input className="input font-mono" name="code" required autoComplete="one-time-code" />
            </label>
            <div className="flex gap-2">
              <button className="btn-sm rounded-md border border-danger/50 px-3 text-danger hover:bg-danger/10" disabled={offPending}>
                Turn off
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmOff(false)}>
                Cancel
              </button>
            </div>
            {offState?.error && (
              <p role="alert" className="text-sm text-danger sm:col-span-3">
                {offState.error}
              </p>
            )}
          </form>
        )}
      </div>

      {/* Sign-in alerts */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <div>
          <p className="font-medium">Sign-in alerts</p>
          <p className="text-sm text-mute">An email each time your account is signed in to, with the device and time.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={alertsOn}
          aria-label="Sign-in alerts"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setSigninAlerts(!alertsOn);
              setAlertsOn(!alertsOn);
              toast.show({ message: `Sign-in alerts ${!alertsOn ? "on" : "off"}` });
            })
          }
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${alertsOn ? "bg-lime" : "bg-line"}`}
        >
          <span className={`switch-thumb absolute left-1 top-1 h-5 w-5 rounded-full bg-ink ${alertsOn ? "translate-x-5" : ""}`} />
        </button>
      </div>
    </div>
  );
}
