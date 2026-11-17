"use client";

import { useActionState, useState } from "react";
import { unlockSite } from "./actions";

/** The password field and Enter. A wrong password shows under the field, is read out, and the typed text stays. */
export function GateForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(unlockSite, undefined);
  // Controlled, so the form reset after a server action doesn't clear what was typed.
  const [password, setPassword] = useState("");
  const error = state?.error;
  return (
    <form action={action} className="cs-form">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="gate-pw" className="cs-lab">
        Have the password?
      </label>
      <input
        id="gate-pw"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "gate-pw-error" : undefined}
        className={`af-fld${error ? " af-bad" : ""}`}
      />
      {error && (
        <p id="gate-pw-error" role="alert" className="cs-err">
          {error}
        </p>
      )}
      <button className="af-btn af-prime" disabled={pending}>
        {pending ? "…" : "Enter"}
      </button>
    </form>
  );
}
