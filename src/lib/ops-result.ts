/**
 * What an ops action answers once it has run (ops server design, piece 1, 1 Nov): the screen shows it in place instead
 * of reading a flash cookie on the next render. Actions return it through OpsForm (src/app/admin/OpsForm.tsx) or the
 * kit's OpsButton (src/app/admin/kit/OpsButton.tsx); the ones not converted yet keep flash() until their screen is
 * redesigned.
 */
/** `undoToken`: a signed token for undoSend (src/lib/ops-undo.ts), when the action held an email and can be taken back (not `undo`, which is the toast's own callback, OpsToastExtras). */
export type OpsResult = { ok: true; message: string; undoToken?: string } | { ok: false; error: string };

/** The browser event OpsForm sends with a result, for the admin toast to show it (the row may already be gone). */
export const OPS_RESULT_EVENT = "ft:ops-result";

/**
 * What the toast can offer besides the message (ops kit, 1 Nov). `undo` adds an Undo button and ⌘Z / Ctrl+Z.
 * `sendIn` holds a send: the toast says "Sending in 5 s · Undo" and calls `commit` only when the window closes without
 * an undo. The hold is only on screen for now; the server-side hold (outbox not_before) comes with the backend work.
 */
export type OpsToastExtras = { undo?: () => unknown; sendIn?: number; commit?: () => unknown };
export type OpsToastDetail = OpsResult & OpsToastExtras;

export function announceOps(result: OpsResult, extras: OpsToastExtras = {}) {
  window.dispatchEvent(new CustomEvent<OpsToastDetail>(OPS_RESULT_EVENT, { detail: { ...result, ...extras } }));
}
