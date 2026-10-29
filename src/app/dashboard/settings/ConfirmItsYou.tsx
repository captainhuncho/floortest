"use client";

import { useState } from "react";

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
      className={`space-y-3 rounded-md border border-line p-4 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(password, code);
      }}
    >
      <p className="text-sm">First, confirm it&apos;s you.</p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-60"
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
            className="input max-w-44 font-mono tracking-widest"
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
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-danger btn-sm min-h-11" disabled={pending}>
          {action}
        </button>
        <button type="button" className="btn-ghost btn-sm min-h-11" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
