"use client";

import { useActionState, useId, useState } from "react";
import type { ReportState } from "./actions/report";

const REASONS = [
  { value: "abuse", label: "Abusive, hateful or harmful" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "copyright", label: "Not theirs to send (copyright)" },
  { value: "other", label: "Something else" },
] as const;

/**
 * Report a track to the FloorTest team (App Store Review 1.2). Opens in place under the track's buttons; admins and
 * owners can block the sender in the same step.
 */
export function ReportTrack({
  action,
  senderName,
  canBlock,
}: {
  action: (state: ReportState, form: FormData) => Promise<ReportState>;
  senderName: string;
  canBlock: boolean;
}) {
  const [open, setOpen] = useState(false);
  const noteId = useId();
  const [state, submit, pending] = useActionState(action, undefined);

  if (state?.ok)
    return (
      <p role="status" className="mt-2 text-[12px] text-mute">
        Reported. The FloorTest team will look at it{state.blocked ? `, and ${senderName} is blocked from sending to you` : ""}.
      </p>
    );

  if (!open)
    return (
      <button type="button" className="btn btn-sm text-mute hover:text-bone" onClick={() => setOpen(true)}>
        Report
      </button>
    );

  return (
    <form action={submit} className="mt-2 w-full rounded-xl border border-line bg-well p-3 text-left">
      <fieldset>
        <legend className="text-[13px] font-semibold text-bone">Report this track</legend>
        <div className="mt-2 flex flex-col">
          {REASONS.map((r, i) => (
            <label key={r.value} className="flex min-h-11 items-center gap-2.5 text-[13px] text-bone">
              <input type="radio" name="reason" value={r.value} required defaultChecked={i === 0} className="size-[18px] shrink-0 accent-lime" />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="label mt-2 mb-1.5 block" htmlFor={noteId}>
        Anything we should know (optional)
      </label>
      <textarea id={noteId} name="note" maxLength={2000} className="input min-h-16 resize-y max-sm:text-base" />
      {canBlock && (
        <label className="mt-2 flex min-h-11 items-center gap-2.5 text-[13px] text-bone">
          <input type="checkbox" name="block" className="size-[18px] shrink-0 accent-lime" />
          Also block {senderName}
        </label>
      )}
      {state?.error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {state.error}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost btn-sm" disabled={pending}>
          {pending ? "Sending…" : "Send report"}
        </button>
        <button type="button" className="btn btn-sm text-mute" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
