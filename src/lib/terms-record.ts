import "server-only";
import crypto from "node:crypto";
import { now, q, type Queryable } from "./db";

/**
 * Terms acceptance records (Research brief, owner 15 Nov). The Terms people accept is the exact text the Terms page
 * shows: its title, date and every section, read from the page itself, so the record can never drift from the page.
 * Each version's text is archived once, keyed by its hash, the first time it is seen (the first request after it
 * ships). A tick is stored against the account, or against the confirmed email of a sender without one.
 */
export type CurrentTerms = { version: string; hash: string; body: string };

type Section = [string, string[]];

/** The Terms page as plain text: title, date, then each heading and its paragraphs. */
export function termsBody(title: string, updated: string, sections: Section[]) {
  const parts = [title, `Last updated ${updated}`];
  for (const [heading, paras] of sections) parts.push("", heading, ...paras);
  return parts.join("\n");
}

export const termsHash = (body: string) => crypto.createHash("sha256").update(body, "utf8").digest("hex");

/** Hashes this process has already archived, so a page load costs no write once a version is stored. */
const archived = new Set<string>();

/**
 * The Terms in force now, archived the first time this exact text is seen. Read from the page on every call (the
 * page can change with the "sharing" switch); the archive write happens once per version per process.
 */
export async function currentTerms(): Promise<CurrentTerms> {
  const { default: Terms } = await import("@/app/terms/page");
  const page = (await Terms()) as { props: { title: string; updated?: string; sections: Section[] } };
  const { title, updated = "", sections } = page.props;
  const body = termsBody(title, updated, sections);
  const terms = { version: updated, hash: termsHash(body), body };
  if (!archived.has(terms.hash)) {
    await q.run("INSERT INTO terms_versions (hash, version, body, created_at) VALUES (?,?,?,?) ON CONFLICT (hash) DO NOTHING", terms.hash, terms.version, terms.body, now());
    archived.add(terms.hash);
  }
  return terms;
}

export type Acceptance = { id: number; version: string; hash: string; name: string; accepted_at: number; pdf_sent_at: number | null };

const COLS = "id, version, hash, name, accepted_at, pdf_sent_at";

/** The latest acceptance by this account or sender email, if any. */
export async function latestAcceptance(who: { userId: number } | { email: string }, db: Queryable = q) {
  return "userId" in who
    ? db.get<Acceptance>(`SELECT ${COLS} FROM terms_acceptances WHERE user_id = ? ORDER BY accepted_at DESC, id DESC LIMIT 1`, who.userId)
    : db.get<Acceptance>(`SELECT ${COLS} FROM terms_acceptances WHERE email = ? ORDER BY accepted_at DESC, id DESC LIMIT 1`, who.email);
}

/**
 * True when they must tick again: no acceptance yet, or the last one was for other text. Compared by hash, so any
 * change to the wording asks again even if the date wasn't moved.
 */
export async function needsTermsTick(who: { userId: number } | { email: string }, terms?: CurrentTerms) {
  const t = terms ?? (await currentTerms());
  const last = await latestAcceptance(who);
  return !last || last.hash !== t.hash;
}

/** Records a tick for the current Terms. Returns the new row (and whether it is the first for this text). */
export async function recordAcceptance(who: { userId: number } | { email: string }, name: string, terms?: CurrentTerms, db: Queryable = q) {
  const t = terms ?? (await currentTerms());
  const prior = await db.get<{ id: number }>(
    "userId" in who
      ? "SELECT id FROM terms_acceptances WHERE user_id = ? AND hash = ? LIMIT 1"
      : "SELECT id FROM terms_acceptances WHERE email = ? AND hash = ? LIMIT 1",
    "userId" in who ? who.userId : who.email,
    t.hash,
  );
  const row = (await db.get<Acceptance>(
    `INSERT INTO terms_acceptances (user_id, email, version, hash, name, accepted_at) VALUES (?,?,?,?,?,?) RETURNING ${COLS}`,
    "userId" in who ? who.userId : null,
    "userId" in who ? null : who.email,
    t.version,
    t.hash,
    name.slice(0, 200),
    now(),
  ))!;
  return { row, first: !prior };
}

/** The archived text a stored acceptance points at (for the PDF and for disputes). */
export const archivedTerms = (hash: string) => q.get<{ version: string; body: string }>("SELECT version, body FROM terms_versions WHERE hash = ?", hash);

/**
 * The stamped PDF to attach to a sender's "Delivered" email: their latest acceptance, if its copy hasn't gone out yet
 * (so once per Terms version). Claimed when the email is sent (lib/mail.ts), so two sends at once attach it once.
 */
export async function pendingTermsPdf(email: string, db: Queryable = q) {
  const last = await latestAcceptance({ email }, db);
  return last && last.pdf_sent_at === null ? { acceptanceId: last.id, email } : undefined;
}
