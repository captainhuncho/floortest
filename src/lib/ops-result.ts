/**
 * What an ops action answers once it has run (ops server design, piece 1, 1 Nov): the screen shows it in place instead
 * of reading a flash cookie on the next render. Actions return it through OpsForm (src/app/admin/OpsForm.tsx); the ones
 * not converted yet keep flash() until their screen is redesigned.
 */
export type OpsResult = { ok: true; message: string } | { ok: false; error: string };

/** The browser event OpsForm sends with a result, for the admin toast to show it (the row may already be gone). */
export const OPS_RESULT_EVENT = "ft:ops-result";

export function announceOps(result: OpsResult) {
  window.dispatchEvent(new CustomEvent<OpsResult>(OPS_RESULT_EVENT, { detail: result }));
}
