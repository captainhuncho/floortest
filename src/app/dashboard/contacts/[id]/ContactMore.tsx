"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { ConfirmButton } from "../../ClientBits";
import { Sheet, SHEET_ROW } from "../Sheet";
import { DANGER_TEXT } from "../ui";

/** The contact page's More action: a short sheet with Copy email and, for owners and admins only, Block or Unblock. */
export function ContactMore({
  name,
  email,
  block,
  className,
  children,
}: {
  name: string;
  email: string;
  /** Left out for Members: they never see Block. */
  block?: { action: () => Promise<void>; blocked: boolean };
  className: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      toast.show({ message: "Email address copied." });
      setOpen(false);
    } catch {
      toast.show({ message: "Couldn't copy. Press and hold the address to copy it." });
    }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        {children}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        <div className="flex flex-col">
          <button type="button" onClick={copy} className={`${SHEET_ROW} text-bone`}>
            <span className="flex min-w-0 flex-col">
              Copy email
              <span className="truncate text-[12px] text-mute">{email}</span>
            </span>
          </button>
          {block && (
            // The same confirm step as the Intake card, with the same words.
            <ConfirmButton
              action={block.action}
              message={block.blocked ? `Unblock ${name}? They can send to your link again.` : `Block ${name}? They can't send to your link any more, and they won't be told. You can unblock them here.`}
              confirmLabel={block.blocked ? "Unblock" : "Block sender"}
              danger={!block.blocked}
              className={`${SHEET_ROW} ${block.blocked ? "text-bone" : DANGER_TEXT}`}
            >
              {block.blocked ? "Unblock sender" : "Block sender"}
            </ConfirmButton>
          )}
        </div>
      </Sheet>
    </>
  );
}
