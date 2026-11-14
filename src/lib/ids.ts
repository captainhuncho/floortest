/**
 * A record id from the browser: a positive safe whole number, given as a number or a string of digits. Anything else
 * (0, negatives, fractions, "1e3", " 7", 2**53, objects) is null, so the caller answers "not there".
 */
export function recordId(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** A project id from the browser: null or "" means "in no project"; otherwise a record id, or NaN when it isn't one. */
export function folderId(v: unknown): number | null {
  if (v == null || v === "") return null;
  return recordId(v) ?? NaN;
}
