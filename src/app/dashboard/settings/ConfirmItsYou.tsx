"use client";

import { useState } from "react";
import { BTN_DANGER, BTN_GHOST, HELP, Notice, WELL } from "./ui";

/**
 * The password (and the two-step code when it's on) before removing a way in or an alert: the same check as adding
 * one, so a borrowed session can't quietly do it.
 */
export function ConfirmItsYou({
  twoFactor,
  action,
  pending,
  error,
  onConfirm,
  onCancel,
  className = "",
}: {
  twoFactor: boolean;
  action: string;
  pending: boolean;
  error: string | null;
  onConfirm: (password: string, code: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  return (
    <form
      className={`${WELL} flex flex-col gap-3 p-3.5 sm:p-4 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(password, code);
      }}
    >
      <p className="text-[13px] font-semibold text-bone">First, confirm it&apos;s you.</p>
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
        <Notice tone="error" next={twoFactor ? "Nothing changed. Check your password and use a fresh code, then try again." : "Nothing changed. Check your password and try again."}>
          {error}
        </Notice>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button className={BTN_DANGER} disabled={pending}>
          {action}
        </button>
        <button type="button" className={BTN_GHOST} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className={HELP}>No password yet? Set one with &ldquo;Forgot your password?&rdquo; on the log-in page first.</p>
    </form>
  );
}
