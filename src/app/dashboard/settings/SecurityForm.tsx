"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useActionForm } from "@/components/useActionForm";
import { changePassword, signOutDevice, signOutOtherDevices } from "../actions/security";
import { PasswordStrength } from "@/components/PasswordStrength";
import { ConfirmItsYou } from "./ConfirmItsYou";
import { Chip, Icon } from "@/components/Kit";
import { BTN, BTN_GHOST, FIELD, Notice, ROW, SettingLine, WELL } from "./ui";

export type Device = { id: string; device: string; app: boolean; current: boolean; signedIn: string; lastUsed: string | null };

export function SecurityForm({ devices, context = [], twoFactor }: { devices: Device[]; context?: string[]; twoFactor: boolean }) {
  const [pw, setPw] = useState("");
  const [state, onSubmit, pending] = useActionForm(changePassword, undefined);
  const [list, setList] = useState(devices);
  const [busy, start] = useTransition();
  const toast = useToast();
  const others = list.filter((d) => !d.current).length;
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [othersError, setOthersError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          onSubmit(e);
        }}
        className="grid gap-4 sm:grid-cols-3 sm:items-start"
      >
        <label className="flex flex-col gap-1.5">
          <span className={FIELD}>Current password</span>
          <input className="input" type="password" name="current" required autoComplete="current-password" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={FIELD}>New password</span>
          <input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
          <PasswordStrength value={pw} context={context} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={FIELD}>Repeat new password</span>
          <input className="input" type="password" name="confirm" required minLength={8} autoComplete="new-password" />
        </label>
        {twoFactor && (
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Two-step code</span>
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit or recovery code" className="input" />
          </label>
        )}
        <div className="flex flex-col gap-3 sm:col-span-3">
          {state?.error && (
            <Notice tone="error" next="Your password hasn't changed. Fix that and try again.">
              {state.error}
            </Notice>
          )}
          {state?.ok && (
            <Notice tone="ok" next="Use the new password next time you sign in on another device.">
              Password changed. Other devices were signed out.
            </Notice>
          )}
          <button className={`${BTN} w-full sm:w-fit`} disabled={pending}>
            {pending ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <SettingLine
          title="Signed-in devices"
          sub={
            <>
              {others ? `Signed in on ${others} other device${others === 1 ? "" : "s"}.` : "Only signed in on this device."} A browser that isn&apos;t used for 14 days is signed out by itself.
            </>
          }
        >
          <button className={`${BTN_GHOST} w-full sm:w-auto`} disabled={!others || busy || confirmOthers} onClick={() => setConfirmOthers(true)}>
            Sign out other devices
          </button>
        </SettingLine>
        {confirmOthers && (
          <ConfirmItsYou
            twoFactor={twoFactor}
            action="Sign out other devices"
            pending={busy}
            error={othersError}
            onCancel={() => {
              setConfirmOthers(false);
              setOthersError(null);
            }}
            onConfirm={(password, code) =>
              start(async () => {
                const r = await signOutOtherDevices(password, code);
                if ("error" in r) return setOthersError(r.error);
                setConfirmOthers(false);
                setOthersError(null);
                setList((l) => l.filter((d) => d.current));
                toast.show({ message: r.n ? `Signed out ${r.n} other device${r.n === 1 ? "" : "s"}` : "No other devices were signed in" });
              })
            }
          />
        )}
        <ul className={WELL} aria-label="Devices signed in">
          {list.map((d) => (
            <li key={d.id} className={`${ROW} flex-nowrap!`}>
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-card text-mute">
                  <Icon name={d.app ? "music" : "grid"} className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-bone">
                    {d.device}
                    {d.app && <Chip>FloorTest app</Chip>}
                    {d.current && <Chip tone="acc">This device</Chip>}
                  </p>
                  <p className="text-[11.5px] text-mute">
                    Signed in {d.signedIn}
                    {d.lastUsed && d.lastUsed !== d.signedIn ? `, last used ${d.lastUsed}` : ""}
                  </p>
                </div>
              </div>
              {!d.current && (
                <button
                  className={BTN_GHOST}
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r = await signOutDevice(d.id);
                      if ("error" in r) return toast.show({ message: r.error });
                      setList((l) => l.filter((x) => x.id !== d.id));
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
