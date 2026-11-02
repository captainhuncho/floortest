"use client";

import { announceOps, type OpsResult } from "@/lib/ops-result";
import { addNote, saveTags, setPlanFor, suspendAccount } from "../../actions";
import type { KitConfirmOptions } from "../../kit/Confirm";
import { InlineEdit, type EditOption } from "../../kit/InlineEdit";
import type { CrmRow } from "./data";
import type { Editable } from "./model";

type Ask = (o: KitConfirmOptions) => Promise<{ reason: string } | null>;

const formOf = (k: string, v: string) => {
  const f = new FormData();
  f.set(k, v);
  return f;
};
/** Says a success once in the toast (a refusal shows under the cell instead), with Undo where it can be undone. */
const NOT_THROUGH: OpsResult = { ok: false, error: "That didn't go through" };
const toldOnce = (r: OpsResult | void, undo?: () => unknown): OpsResult => {
  const res = r ?? NOT_THROUGH;
  if (res.ok) announceOps(res, undo ? { undo } : {});
  return res;
};

/**
 * Each in-place save, one account at a time, through an action that answers with OpsResult. Tags and the plan offer
 * Undo (they put the old value back); a note is added, so it has none; suspending asks for a reason and has no undo.
 */
export function savers(u: CrmRow, ask: Ask, toast = true) {
  const told = (r: OpsResult | void, undo?: () => unknown) => (toast ? toldOnce(r, undo) : (r ?? NOT_THROUGH));
  return {
    tags: async (next: string | string[], prev: string | string[]) =>
      told(await saveTags(u.id, formOf("tags", [next].flat().join(",")), true), () => saveTags(u.id, formOf("tags", [prev].flat().join(",")), true)),
    note: async (next: string | string[]) => told(await addNote(u.id, formOf("note", String(next)), true)),
    plan: async (next: string | string[], prev: string | string[]) =>
      told(await setPlanFor(u.id, String(next), true), () => setPlanFor(u.id, String(prev), true)),
    status: async (next: string | string[]) => {
      if (next !== "Suspended") return null;
      const yes = await ask({
        title: `Suspend ${u.name}?`,
        body: "They are signed out now, their link goes offline and they get an email with your reason and a way to appeal. Nothing is deleted. You can restore them from their record.",
        names: [`${u.name} @${u.handle}`],
        requireReason: true,
        confirmLabel: "Suspend",
        danger: true,
      });
      if (!yes) return null;
      return told(await suspendAccount(u.id, yes.reason, true));
    },
  };
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className="ou-pill" data-status={status}>
      <span aria-hidden className="ou-dot" />
      {status}
    </span>
  );
}

export function PlanPill({ plan, label }: { plan: string; label: string }) {
  return (
    <span className="ou-pill ou-plan" data-paid={plan !== "free" || undefined}>
      {label}
    </span>
  );
}

export const TagChips = ({ tags }: { tags: readonly string[] }) => (
  <span className="kit-chips ou-tags">
    {tags.map((t, i) => (
      <span key={t} className="kit-chip">
        {i ? " " : ""}
        {t}
      </span>
    ))}
  </span>
);

/** The editable fields of one account, the same in the table, the drawer and the phone sheet. */
export function fieldsFor({ u, edit, plans, ask, fullNote = false }: { u: CrmRow; edit: Editable; plans: EditOption[]; ask: Ask; fullNote?: boolean }) {
  const save = savers(u, ask);
  const planLabel = plans.find((p) => p.value === u.plan)?.label ?? u.plan;
  return {
    tags: edit.tags ? (
      <InlineEdit type="tags" value={u.tags} label={`tags for ${u.name}`} placeholder="Add tag" display={(v) => <TagChips tags={[v].flat()} />} save={save.tags} />
    ) : u.tags.length ? (
      <TagChips tags={u.tags} />
    ) : (
      <span className="text-mute">None</span>
    ),
    note: edit.note ? (
      <InlineEdit
        type="text"
        startEmpty
        value={u.note}
        label={`a new note for ${u.name}`}
        placeholder="Add note"
        maxLength={2000}
        // Where the whole note is already shown above (the drawer), the control only offers another one.
        display={fullNote ? () => <span className="text-mute">Add another note</span> : undefined}
        save={save.note}
      />
    ) : (
      <span className="ou-note">{u.note || <span className="text-mute">None</span>}</span>
    ),
    plan:
      edit.plan && plans.some((p) => p.value === u.plan) ? (
        <InlineEdit type="select" value={u.plan} label={`plan for ${u.name}`} options={plans} display={() => <PlanPill plan={u.plan} label={planLabel} />} save={save.plan} />
      ) : (
        <PlanPill plan={u.plan} label={planLabel} />
      ),
    status:
      edit.suspend && u.status !== "Suspended" ? (
        <InlineEdit
          type="select"
          value={u.status}
          label={`status for ${u.name}`}
          options={[
            { value: u.status, label: u.status },
            { value: "Suspended", label: "Suspend…" },
          ]}
          display={() => <StatusPill status={u.status} />}
          save={save.status}
        />
      ) : (
        <StatusPill status={u.status} />
      ),
  };
}
