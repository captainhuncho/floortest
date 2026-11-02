"use client";

import Link from "next/link";
import { useId } from "react";
import { useModalDialog } from "@/components/Dialog";
import type { KitConfirmOptions } from "../../kit/Confirm";
import type { EditOption } from "../../kit/InlineEdit";
import { OpsButton } from "../../kit/OpsButton";
import type { CrmRow } from "./data";
import { fieldsFor, savers } from "./fields";
import { initials, type Editable } from "./model";

/**
 * One account's key facts beside the list (admin redesign B, step 5): a modal dialog on the right from 768 px, a sheet
 * from the bottom on phones. Named by the account, focus kept inside, Esc or a tap outside closes it and focus goes
 * back to the row it came from. Tags, a new note, the plan (super admin) and Suspend… work here as in the table; the
 * full record is one link away.
 */
export function RecordDrawer({
  u,
  open,
  onClose,
  edit,
  plans,
  ask,
}: {
  u: CrmRow | null;
  open: boolean;
  onClose: () => void;
  edit: Editable;
  plans: EditOption[];
  ask: (o: KitConfirmOptions) => Promise<{ reason: string } | null>;
}) {
  const { modalProps } = useModalDialog(open && !!u, onClose);
  const titleId = useId();
  const f = u && fieldsFor({ u, edit, plans, ask, fullNote: true });
  return (
    // A native <dialog> is already role=dialog; an explicit role would make the kit read it as open while closed.
    <dialog aria-labelledby={titleId} className="ou-drawer" {...modalProps}>
      {u && f && (
        <div className="ou-drawer-panel">
          <header className="ou-drawer-head">
            <span aria-hidden className="ou-avatar ou-avatar--lg">
              {initials(u.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-[18px] font-semibold tracking-[-0.02em]">
                {u.name}
              </h2>
              <p className="truncate text-[13px] text-mute">
                @{u.handle}
                {u.email ? ` · ${u.email}` : ""}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close record" className="ou-icon-btn">
              <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M7 7l10 10M17 7 7 17" />
              </svg>
            </button>
          </header>
          <dl className="ou-facts">
            <dt>Status</dt>
            <dd>{f.status}</dd>
            <dt>Type</dt>
            <dd>{u.kind}</dd>
            <dt>Plan</dt>
            <dd>{f.plan}</dd>
            <dt>Tags</dt>
            <dd>{f.tags}</dd>
            <dt>Latest note</dt>
            <dd>
              {u.note && edit.note && <p className="ou-note-full">{u.note}</p>}
              {f.note}
            </dd>
            <dt>Live tracks</dt>
            <dd className="tnum">{u.live.toLocaleString("en-GB")}</dd>
            <dt>Sign-in</dt>
            <dd>{u.twoFactor ? "Two-factor on" : "Password only"}</dd>
            <dt>Joined</dt>
            <dd className="tnum">{u.joined}</dd>
          </dl>
          <footer className="ou-drawer-foot">
            <Link href={`/admin/accounts/${u.id}`} className="ou-btn">
              Open full record
            </Link>
            {edit.suspend && u.status !== "Suspended" && (
              <OpsButton className="kit-btn kit-btn--danger" action={() => savers(u, ask, false).status("Suspended")} done="Suspended">
                Suspend…
              </OpsButton>
            )}
          </footer>
        </div>
      )}
    </dialog>
  );
}
