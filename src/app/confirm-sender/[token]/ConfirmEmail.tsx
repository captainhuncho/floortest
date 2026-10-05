"use client";

import { useState, useTransition } from "react";
import { confirmEmail } from "./actions";

export function ConfirmEmail({ token, name, email }: { token: string; name: string; email: string }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  if (done)
    return (
      <div role="status">
        <h1 className="text-3xl font-bold tracking-tight">Email confirmed</h1>
        <p className="mt-3 text-mute">Thanks, {name}. Your tracks now show as coming from a verified sender. You can close this page.</p>
      </div>
    );
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Confirm your email</h1>
      <p className="mt-3 text-mute">
        Confirm that <span className="text-bone">{email}</span> is yours so receivers see you as a verified sender.
      </p>
      <button
        className="btn-lime mt-6"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (await confirmEmail(token)) setDone(true);
            else setFailed(true);
          })
        }
      >
        {pending ? "Confirming…" : "Confirm my email"}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-danger">
          That didn&apos;t work. The link may have been replaced.
        </p>
      )}
    </>
  );
}
