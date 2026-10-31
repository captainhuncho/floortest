"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useActionForm } from "@/components/useActionForm";
import { confirmTwoFactor, disableTwoFactor, setSigninAlerts, startTwoFactor } from "../actions/security";
import { ConfirmItsYou } from "./ConfirmItsYou";
import { Chip } from "@/components/Kit";
import { BTN, BTN_DANGER, BTN_GHOST, FIELD, HELP, Notice, SettingLine, Switch, WELL } from "./ui";

/** Optional account protections the holder chooses: authenticator-app sign-in and sign-in alerts. */
export function TwoFactor({ enabled, alerts }: { enabled: boolean; alerts: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(enabled);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [alertsOn, setAlertsOn] = useState(alerts);
  const [pending, start] = useTransition();
  const [offState, submitOff, offPending] = useActionForm(disableTwoFactor, undefined);
  const [confirmOff, setConfirmOff] = useState(false);
  const [alertsOff, setAlertsOff] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  if (offState?.ok && on) setOn(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Two-factor */}
      <div className="flex flex-col gap-4">
        <SettingLine
          title={
            <>
              Two-factor sign-in {on ? <Chip tone="up">On</Chip> : <Chip>Off</Chip>}
            </>
          }
          sub="A code from an authenticator app (Google Authenticator, 1Password, Authy) after your password."
        >
          {!on && !setup && (
            <button
              className={`${BTN} w-full sm:w-auto`}
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
            <button className={`${BTN_GHOST} w-full sm:w-auto`} onClick={() => setConfirmOff(true)}>
              Turn off…
            </button>
          )}
        </SettingLine>

        {setup && !codes && (
          <div className={`${WELL} grid gap-5 p-4 sm:grid-cols-[auto_1fr] sm:p-5`}>
            {/* The QR stays on white so every authenticator app can read it, in either theme. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="justify-self-center rounded-[12px] bg-white p-2 sm:justify-self-start" />
            <div className="flex min-w-0 flex-col gap-3">
              <p className="text-[13px] text-bone">
                <span className="font-semibold">Step 1.</span> Scan this with your authenticator app, or type the key in by hand:
              </p>
              <p className="break-all rounded-[10px] border border-line bg-card px-3 py-2 font-mono text-[12px] text-bone">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
              <p className="text-[13px] text-bone">
                <span className="font-semibold">Step 2.</span> Enter the 6-digit code it shows, and your password:
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <input
                  className="input font-mono tracking-widest sm:max-w-40"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="6-digit code"
                />
                <input
                  className="input sm:max-w-52"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Password"
                />
              </div>
              {error && (
                <Notice tone="error" next="Two-factor is still off. Check the code in your app and your password, then press Turn on again.">
                  {error}
                </Notice>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  className={BTN}
                  disabled={pending || code.replace(/\s/g, "").length !== 6 || !password}
                  onClick={() =>
                    start(async () => {
                      const r = await confirmTwoFactor(code, password);
                      if (r.error) return setError(r.error);
                      setPassword("");
                      setCodes(r.codes ?? []);
                      setOn(true);
                      setSetup(null);
                      toast.show({ message: "Two-factor sign-in is on" });
                    })
                  }
                >
                  Turn on
                </button>
                <button className={BTN_GHOST} onClick={() => setSetup(null)}>
                  Cancel
                </button>
              </div>
              <p className={HELP}>No password yet (you sign in with Google or an email code)? Set one with &ldquo;Forgot your password?&rdquo; on the log-in page first.</p>
            </div>
          </div>
        )}

        {codes && (
          <div className="rounded-[13px] border border-lime/35 bg-lime/[0.05] p-4 sm:p-5">
            <p className="text-[14px] font-semibold text-bone">Save your recovery codes</p>
            <p className="mt-1 text-[12.5px] leading-snug text-mute">
              If you lose your phone, each of these works once instead of a code. They won&apos;t be shown again, so store them in your password
              manager.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-[13px] sm:grid-cols-5">
              {codes.map((c) => (
                <li key={c} className="rounded-[9px] border border-line bg-well px-2 py-1.5 text-center text-bone">
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                className={BTN_GHOST}
                onClick={() => {
                  navigator.clipboard?.writeText(codes.join("\n"));
                  toast.show({ message: "Recovery codes copied" });
                }}
              >
                Copy codes
              </button>
              <button className={BTN} onClick={() => setCodes(null)}>
                I&apos;ve saved them
              </button>
            </div>
          </div>
        )}

        {on && confirmOff && (
          <form onSubmit={submitOff} className={`${WELL} grid gap-3 p-3.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-4`}>
            <label className="flex flex-col gap-1.5">
              <span className={FIELD}>Password</span>
              <input className="input" type="password" name="password" required autoComplete="current-password" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={FIELD}>Code or recovery code</span>
              <input className="input font-mono" name="code" required autoComplete="one-time-code" />
            </label>
            <div className="flex gap-2">
              <button className={`${BTN_DANGER} flex-1 sm:flex-none`} disabled={offPending}>
                Turn off
              </button>
              <button type="button" className={`${BTN_GHOST} flex-1 sm:flex-none`} onClick={() => setConfirmOff(false)}>
                Cancel
              </button>
            </div>
            {offState?.error && (
              <Notice tone="error" className="sm:col-span-3" next="Two-factor is still on. Use a fresh code from your app or one of your recovery codes.">
                {offState.error}
              </Notice>
            )}
          </form>
        )}
      </div>

      {/* Sign-in alerts */}
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <SettingLine title="Sign-in alerts" sub="An email each time your account is signed in to, with the device and time.">
          <Switch
            on={alertsOn}
            label="Sign-in alerts"
            disabled={pending || alertsOff}
            onClick={() => {
              // Turning them off asks for the password first (below); turning them on doesn't.
              if (alertsOn) return setAlertsOff(true);
              start(async () => {
                const r = await setSigninAlerts(true);
                if ("error" in r) return toast.show({ message: r.error });
                setAlertsOn(true);
                toast.show({ message: "Sign-in alerts on" });
              });
            }}
          />
        </SettingLine>
        {alertsOff && (
          <ConfirmItsYou
            twoFactor={on}
            action="Turn off alerts"
            pending={pending}
            error={alertsError}
            onCancel={() => {
              setAlertsOff(false);
              setAlertsError(null);
            }}
            onConfirm={(pw, c) =>
              start(async () => {
                const r = await setSigninAlerts(false, pw, c);
                if ("error" in r) return setAlertsError(r.error);
                setAlertsOff(false);
                setAlertsError(null);
                setAlertsOn(false);
                toast.show({ message: "Sign-in alerts off" });
              })
            }
          />
        )}
      </div>
    </div>
  );
}
