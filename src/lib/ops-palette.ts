import "server-only";
import { likeContains, q } from "./db";
import { can, type OpsAccess } from "./ops-access";
import { allow } from "./ratelimit";
import { PEOPLE_MAX_RESULTS, peopleQuery } from "../app/admin/kit/core";

/**
 * People search behind ⌘K in ops (admin redesign B, step 1). A server path over every account, so it is held to the
 * same rules as the Users page and kept small: Users (view) or nothing, at least two characters, at most eight
 * results with only the fields the palette shows, and a per-staff rate limit so it can't be used to page through
 * everyone.
 */

/** Searches per staff member per minute: far more than anyone types, far fewer than a script would want. */
export const PALETTE_PER_MINUTE = 60;
const WINDOW_MS = 60_000;
const BUCKET = "ops-people-search";

export type PalettePerson = { id: number; name: string; handle: string; email?: string };
export type PeopleAnswer = { ok: true; people: PalettePerson[] } | { ok: false; error: string };

/** Who may find people in ⌘K: the Users page's own permission. */
export const canFindPeople = (access: OpsAccess) => can(access, "users.read");

/**
 * Whether results carry email addresses. The Users page lists every account's email to anyone who can open it
 * (src/app/admin/accounts/page.tsx needs "users.read"), so this follows it. Kept as its own rule so the two can part
 * if the Users page ever hides emails from a role: email is then neither shown nor searched.
 */
export const canSeeEmails = (access: OpsAccess) => can(access, "users.read");

/** One row as the palette gets it: email only when the viewer may see it. */
export function personResult(row: { id: number; name: string; handle: string; email?: string }, showEmail: boolean): PalettePerson {
  const base = { id: row.id, name: row.name, handle: row.handle };
  return showEmail && row.email ? { ...base, email: row.email } : base;
}

export async function searchPeople(staff: { id: number; access: OpsAccess }, raw: string): Promise<PeopleAnswer> {
  if (!canFindPeople(staff.access)) return { ok: false, error: "You don't have permission to search people." };
  const term = peopleQuery(String(raw ?? ""));
  if (!term) return { ok: true, people: [] };
  if (!(await allow(BUCKET, String(staff.id), PALETTE_PER_MINUTE, WINDOW_MS))) return { ok: false, error: "Too many searches. Wait a minute and try again." };
  // With an "@" in what was typed, the whole address is searched as typed, "@" included: "@floortest" finds that
  // domain, "ana@x" that address, and "@lena" still finds the handle by the name and handle match.
  const typed = String(raw ?? "").trim().slice(0, 100);
  const wholeEmail = typed.includes("@") ? typed : null;
  return { ok: true, people: await findPeople(term, canSeeEmails(staff.access), wholeEmail) };
}

/**
 * The bounded, parameterised query: named columns, at most eight rows. Name and handle match anywhere. Email, only
 * when the viewer may see it: without an "@" in the query just the part before the "@" (so "te" doesn't find everyone
 * at a domain), with one the whole address. Exact @handle first, then names that start with the query, then the rest.
 */
export async function findPeople(term: string, showEmail: boolean, wholeEmail: string | null = null): Promise<PalettePerson[]> {
  const like = likeContains(term);
  const prefix = like.slice(1); // "term%": starts with
  const emailMatch = !showEmail ? "" : wholeEmail ? " OR email ILIKE ?" : " OR split_part(lower(email), '@', 1) ILIKE ?";
  const rows = await q.all<{ id: number; name: string; handle: string; email?: string }>(
    `SELECT id, name, handle${showEmail ? ", email" : ""} FROM users
     WHERE name ILIKE ? OR handle ILIKE ?${emailMatch}
     ORDER BY (lower(handle) = lower(?)) DESC, (name ILIKE ?) DESC, lower(name), id
     LIMIT ${PEOPLE_MAX_RESULTS}`,
    like,
    like,
    ...(showEmail ? [wholeEmail ? likeContains(wholeEmail) : like] : []),
    term,
    prefix,
  );
  return rows.map((r) => personResult(r, showEmail));
}
