"use client";

import { useState } from "react";
import { SUSPEND_MAX } from "@/lib/admin-bulk";
import { suspendAccounts, tagAccounts } from "../../actions";
import { BulkBar } from "../../kit/BulkBar";
import type { KitConfirmOptions } from "../../kit/Confirm";
import { cleanTag } from "../../kit/core";
import { OpsButton } from "../../kit/OpsButton";
import type { useSelection } from "../../kit/Selection";
import type { CrmRow } from "./data";

/**
 * The bulk bar for the picked rows (the kit's BulkBar, as on today's Users): Add tag, Suspend… (a reason, at most
 * SUSPEND_MAX; no undo), Export CSV of just these rows (super admin, like Export CSV today) and Clear. No bulk plan
 * change (owner, 1 Nov).
 */
export function Bulk({ rows, sel, ask, csv }: { rows: CrmRow[]; sel: ReturnType<typeof useSelection<number>>; ask: (o: KitConfirmOptions) => Promise<{ reason: string } | null>; csv: boolean }) {
  const [tag, setTag] = useState("");
  const n = sel.count;
  const picked = rows.filter((r) => sel.isSelected(r.id));
  const form = (extra: Record<string, string>) => {
    const f = new FormData();
    picked.forEach((r) => f.append("ids", String(r.id)));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  const cleaned = cleanTag(tag);
  return (
    <BulkBar count={n} onClear={sel.clear}>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          // Enter in the tag field presses Add tag.
          e.preventDefault();
          e.currentTarget.querySelector<HTMLButtonElement>("button[data-phase]")?.click();
        }}
      >
        <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag, e.g. beta-2" aria-label="Tag to add" maxLength={30} className="input kit-bulk-input" />
        <OpsButton
          className="kit-btn"
          disabled={!cleaned}
          action={() => tagAccounts(form({ tag: cleaned }))}
          done="Tagged"
          onDone={() => {
            setTag("");
            sel.clear();
          }}
        >
          Add tag
        </OpsButton>
      </form>
      {n > SUSPEND_MAX && <span className="kit-bulk-note">Suspend works on {SUSPEND_MAX} at a time</span>}
      <OpsButton
        className="kit-btn kit-btn--danger"
        disabled={n > SUSPEND_MAX}
        done="Suspended"
        onDone={() => sel.clear()}
        action={async () => {
          const ok = await ask({
            title: `Suspend ${n} account${n === 1 ? "" : "s"}?`,
            body: "Each one is signed out, their link goes offline and they get an email with this reason and a way to appeal. Nothing is deleted, and you can restore them from their record.",
            names: picked.map((r) => `${r.name} @${r.handle}`),
            requireReason: true,
            confirmLabel: `Suspend ${n}`,
            danger: true,
          });
          return ok ? suspendAccounts(form({ reason: ok.reason })) : null;
        }}
      >
        Suspend…
      </OpsButton>
      {csv && (
        <a className="kit-btn" href={`/api/admin/users-csv?ids=${picked.map((r) => r.id).join(",")}`} download>
          Export CSV
        </a>
      )}
    </BulkBar>
  );
}
