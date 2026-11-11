"use client";

import { useActionState, useState } from "react";
import type { InviteCreated } from "@/lib/ops-result";

/**
 * Ops → Invites → Create code. A shared code is stored only as its hash (src/lib/invites.ts), so the new code comes back
 * in the action's answer and is shown here, from this page's own memory, until Ops dismisses it; it is never stored in the
 * browser or shown again (Safety, #512 round 1).
 */
export function SharedCodeForm({ action }: { action: (form: FormData) => Promise<InviteCreated> }) {
  const [result, run, pending] = useActionState(async (_: InviteCreated | null, form: FormData) => action(form), null);
  const [hidden, setHidden] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fresh = result?.ok && hidden !== result.code ? result.code : null;
  return (
    <div className="space-y-3">
      <form action={run} aria-busy={pending} className="grid gap-3 rounded-md border border-line p-5 aria-busy:pointer-events-none aria-busy:opacity-60 sm:grid-cols-[1fr_120px_1fr_auto] sm:items-end">
        <label className="block space-y-1.5">
          <span className="label">Code (blank = random; shown once)</span>
          <input name="code" className="input uppercase" placeholder="FLOOR-XXXXXXXXXXXXXXXX" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Max uses</span>
          <input name="max_uses" type="number" min={1} defaultValue={25} className="input" />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Note (who it&apos;s for)</span>
          <input name="note" className="input" placeholder="e.g. Accra DJ collective" />
        </label>
        <button className="btn-lime btn-sm min-h-11">Create code</button>
        {result && !result.ok && (
          <p role="alert" className="text-xs text-danger sm:col-span-4">
            {result.error}
          </p>
        )}
      </form>
      {fresh && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-lime/50 p-4 text-sm">
          <span>
            New code <code className="select-all font-mono text-bone">{fresh}</code>. Copy it now: Ops only keeps its last 4 characters.
          </span>
          <button
            type="button"
            className="btn-sm min-h-11 border border-line"
            onClick={() => {
              navigator.clipboard?.writeText(fresh).then(() => setCopied(true), () => setCopied(false));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="min-h-11 text-mute hover:text-bone" onClick={() => { setHidden(fresh); setCopied(false); }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
