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
 * Report a track to the FloorTest team (App Store Review 1.2). On the review card it opens from More, in its own layer
 * (`startOpen`, with `onCancel` closing that layer); elsewhere it opens in place under its button. Admins and owners
 * can block the sender in the same step.
 */
export function ReportTrack({
  action,
  senderName,
  canBlock,
  startOpen = false,
  onCancel,
}: {
  action: (state: ReportState, form: FormData) => Promise<ReportState>;
  senderName: string;
  canBlock: boolean;
  /** Starts on the form, with no Report button of its own (the review card's More menu opened it). */
  startOpen?: boolean;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
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
      <button type="button" data-more="report" className="btn btn-sm text-mute hover:text-bone" onClick={() => setOpen(true)}>
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
        <button type="button" className="btn btn-sm text-mute" onClick={() => (onCancel ? onCancel() : setOpen(false))}>
          Cancel
        </button>
      </div>
    </form>
  );
}
