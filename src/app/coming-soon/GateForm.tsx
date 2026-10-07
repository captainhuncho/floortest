"use client";

import { useActionState } from "react";
import { unlockSite } from "./actions";

export function GateForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(unlockSite, undefined);
  return (
    <form action={action} className="mt-10 w-full max-w-sm space-y-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="gate-pw" className="label block">
        Have the password?
      </label>
      <div className="flex gap-2">
        <input id="gate-pw" name="password" type="password" required autoComplete="current-password" className="input min-w-0 flex-1" />
        <button className="btn-lime min-h-11 shrink-0 px-5" disabled={pending}>
          {pending ? "…" : "Enter"}
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
