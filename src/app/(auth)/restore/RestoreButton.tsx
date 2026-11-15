"use client";

import { useActionState } from "react";
import { restoreAccount } from "./actions";

export function RestoreButton() {
  const [state, action, pending] = useActionState(async () => restoreAccount(), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? (
        <p role="alert" className="text-[13px]">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="af-btn af-prime" disabled={pending}>
        {pending ? "Restoring…" : "Restore my account"}
      </button>
    </form>
  );
}
