"use client";

import { useActionState } from "react";
import { announceOps, type OpsResult } from "@/lib/ops-result";

/**
 * A form for an ops action that answers with a result (src/lib/ops-result.ts). It keeps the markup and classes of the
 * plain form it replaces. While the server works, its buttons can't be pressed again. A refusal shows under the form,
 * where the row still is; a success goes to the usual toast, because the row has often left the list by then.
 */
export function OpsForm({ action, className = "", children }: { action: (form: FormData) => Promise<OpsResult>; className?: string; children: React.ReactNode }) {
  const [result, run, pending] = useActionState(async (_: OpsResult | null, form: FormData) => {
    const r = await action(form);
    // Announced here, not in an effect: the answer and the refreshed page arrive together and can unmount this form.
    if (r.ok) announceOps(r);
    return r;
  }, null);
  return (
    <form action={run} aria-busy={pending} className={`${className} aria-busy:pointer-events-none aria-busy:opacity-60`}>
      {children}
      {result && !result.ok && (
        <p role="alert" className="basis-full text-xs text-danger">
          {result.error}
        </p>
      )}
    </form>
  );
}
