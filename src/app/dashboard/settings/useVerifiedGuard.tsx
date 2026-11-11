"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/Dialog";

/**
 * Before a save that would take the Verified mark away, ask first (owner, 11 Nov). `changes` says whether the form, as
 * filled in now, really changes what was checked; the server makes the same call and clears the mark. Cancel keeps
 * what was typed; Save anyway sends the form as it is.
 */
export function useVerifiedGuard(
  verified: boolean,
  what: string,
  changes: (form: HTMLFormElement) => boolean,
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void,
) {
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  const confirmed = useRef(false);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    if (verified && !confirmed.current && changes(e.currentTarget)) {
      e.preventDefault();
      setForm(e.currentTarget);
      return;
    }
    confirmed.current = false;
    onSubmit(e);
  };
  const dialog = (
    <ConfirmDialog
      open={!!form}
      onClose={() => setForm(null)}
      onConfirm={() => {
        confirmed.current = true;
        form?.requestSubmit();
      }}
      title="Remove your Verified mark?"
      body={`Changing your ${what} removes your Verified mark until we check it again. You can send it for checking from Verified mark below.`}
      confirmLabel="Save anyway"
    />
  );
  return [submit, dialog] as const;
}
