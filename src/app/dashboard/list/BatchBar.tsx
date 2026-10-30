"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { batchTracks, type BatchAction } from "../actions/batch";

/**
 * The List view's batch bar: what to do with the selected tracks. Keep and Not for me stay private from senders, as one by one.
 * Delete removes the files for good, so it asks first.
 */
export function BatchBar({
  ids,
  collections,
  onDone,
  onDecide,
}: {
  ids: number[];
  collections: { id: number; name: string }[];
  onDone: () => void;
  /** Shows the new decision straight away, before the page refreshes. */
  onDecide: (d: "kept" | "passed" | null) => void;
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const n = ids.length;
  const tracks = (k: number) => `${k} track${k === 1 ? "" : "s"}`;

  function run(action: BatchAction, said: (k: number) => string) {
    start(async () => {
      if (action.type === "kept" || action.type === "passed") onDecide(action.type);
      if (action.type === "clear") onDecide(null);
      const r = await batchTracks(ids, action);
      if (r.error) return void toast.show({ message: r.error });
      toast.show({ message: said(r.done) + (r.skipped ? ` (${r.skipped} skipped)` : "") });
      setConfirming(false);
      onDone();
    });
  }

  const btn = "btn btn-sm btn-ghost";
  return (
    <div
      role="region"
      aria-label="Selected tracks"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-40 mx-auto max-w-3xl rounded-[18px] border border-line-2 bg-card p-3 shadow-pop md:bottom-6"
    >
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs text-bone">
            Delete {tracks(n)}? The files are removed for good and senders see them as removed.
          </p>
          <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => run({ type: "delete", confirm: "delete" }, (k) => `Deleted ${tracks(k)}`)}>
            Delete {tracks(n)}
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-xs font-bold text-bone" aria-live="polite">
            {n} selected
          </p>
          <button type="button" className={btn} disabled={busy} onClick={() => run({ type: "kept" }, (k) => `Kept ${tracks(k)}`)}>
            Keep
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => run({ type: "passed" }, (k) => `Not for me: ${tracks(k)}`)}>
            Not for me
          </button>
          <button type="button" className={btn} disabled={busy} onClick={() => run({ type: "clear" }, (k) => `${tracks(k)} back in Needs review`)}>
            Needs review
          </button>
          {collections.length > 1 && (
            <label className="flex items-center">
              <span className="sr-only">Move to collection</span>
              <select
                className="input !w-auto !py-1.5 text-xs"
                disabled={busy}
                value=""
                onChange={(e) => {
                  const c = collections.find((x) => x.id === Number(e.target.value));
                  if (c) run({ type: "move", collection: c.id }, (k) => `Moved ${tracks(k)} to ${c.name}`);
                }}
              >
                <option value="">Move to…</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a className={btn} href={`/api/export?ids=${ids.join(",")}&files=1&name=${encodeURIComponent("FloorTest - Selected")}`}>
            Download
          </a>
          <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
