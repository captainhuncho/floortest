"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/Dialog";

/**
 * Before a save that would take the Verified mark away, ask first (owner, 11 Nov). `changes` names what the form, as
 * filled in now, really changes of what was checked ("profiles", "username"), or null; the server makes the same call and
 * clears the mark. Focus starts on Cancel, so Enter never removes the mark by accident. Cancel keeps what was typed;
 * Save anyway sends the form as it is.
 */
export function useVerifiedGuard(
  verified: boolean,
  changes: (form: HTMLFormElement) => string | null,
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void,
) {
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  const [what, setWhat] = useState("");
  const confirmed = useRef(false);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    const changed = verified && !confirmed.current ? changes(e.currentTarget) : null;
    if (changed) {
      e.preventDefault();
      setWhat(changed);
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
        // requestSubmit runs the submit handler straight away, or not at all when the browser's own checks stop the form;
        // either way the next save asks again.
        confirmed.current = true;
        form?.requestSubmit();
        confirmed.current = false;
      }}
      title="Remove your Verified mark?"
      body={`Changing your ${what} removes your Verified mark until we check it again. You can send it for checking from Verified mark below.`}
      confirmLabel="Save anyway"
      danger
    />
  );
  return [submit, dialog] as const;
}
