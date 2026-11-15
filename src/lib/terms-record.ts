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

/** How long one server keeps the Terms it read: the page can change with the "sharing" switch, so not for good. */
export const TERMS_CACHE_MS = 60_000;
let cached: { at: number; terms: CurrentTerms } | undefined;

/**
 * The Terms in force now, archived the first time this exact text is seen. Read from the page, at most once a minute
 * per server (every desk request asks). The text includes the sharing wording when the "sharing" switch is on, so
 * flipping that switch is a change to the Terms people agreed to and asks everyone again: deliberate (Safety S3, 15 Nov).
 */
export async function currentTerms(): Promise<CurrentTerms> {
  if (cached && Date.now() - cached.at < TERMS_CACHE_MS) return cached.terms;
  try {
    const terms = await readTerms();
    cached = { at: Date.now(), terms };
    return terms;
  } catch (e) {
    // A failed read or archive serves the last good text (Safety, 15 Nov), and tries again on the next request.
    if (!cached) throw e;
    console.error("[terms] couldn't read the Terms; using the last good copy", e);
    return cached.terms;
  }
}

/**
 * For pages that must stay up when the Terms can't be read at all (no copy yet on this server): the desk then skips the
 * tick for this request rather than failing every page, and the send page leaves the hash out (the send route still
 * refuses a tick that isn't for the current text).
 */
export async function currentTermsOrNull(): Promise<CurrentTerms | null> {
  try {
    return await currentTerms();
  } catch (e) {
    console.error("[terms] couldn't read the Terms", e);
    return null;
  }
}

/** Forget the cached Terms (tests). */
export const forgetTerms = () => {
  cached = undefined;
};

async function readTerms(): Promise<CurrentTerms> {
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

export type Acceptance = { id: number; email: string; version: string; hash: string; name: string; accepted_at: number; pdf_sent_at: number | null };

const COLS = "id, email, version, hash, name, accepted_at, pdf_sent_at";

/** The latest acceptance by this account or sender email, if any. */
export async function latestAcceptance(who: { userId: number } | { email: string }, db: Queryable = q) {
  return "userId" in who
    ? db.get<Acceptance>(`SELECT ${COLS} FROM terms_acceptances WHERE user_id = ? ORDER BY accepted_at DESC, id DESC LIMIT 1`, who.userId)
    : db.get<Acceptance>(`SELECT ${COLS} FROM terms_acceptances WHERE kind = 'sender' AND email = ? ORDER BY accepted_at DESC, id DESC LIMIT 1`, who.email);
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

/**
 * Whether the desk must send this person to /accept-terms first: never in an admin's view of someone's desk, and not
 * when the Terms can't be read at all (the desk stays up; it asks on a later request).
 */
export async function deskNeedsTerms(viewing: boolean, userId: number) {
  if (viewing) return false;
  const terms = await currentTermsOrNull();
  return !!terms && (await needsTermsTick({ userId }, terms));
}

/**
 * Records a tick for the current Terms. An account's row also keeps the person's email, so it still proves the
 * acceptance after the account is deleted (kept 6 years, lib/retention.ts). Returns the new row (and whether it is the
 * first for this text). Runs under a lock on the person, so a double submit or two sends at once record one tick and
 * send one copy (Safety, 15 Nov). Pass `db` to run inside the caller's transaction (sign-up).
 */
export async function recordAcceptance(who: { userId: number; email: string } | { email: string }, name: string, terms?: CurrentTerms, db?: Queryable) {
  const t = terms ?? (await currentTerms());
  return db ? recordLocked(who, name, t, db) : q.tx((tx) => recordLocked(who, name, t, tx));
}

async function recordLocked(who: { userId: number; email: string } | { email: string }, name: string, t: CurrentTerms, db: Queryable) {
  const account = "userId" in who;
  await db.get("SELECT pg_advisory_xact_lock(hashtext(?))", account ? `terms:user:${who.userId}` : `terms:sender:${who.email}`);
  // Ticking the text they last accepted again adds nothing (no row, no copy): a resubmitted form can't grow the table
  // or send copy after copy (Safety M3). A text accepted before and changed since is a new tick, so it gets its row.
  const last = await latestAcceptance(account ? { userId: who.userId } : { email: who.email }, db);
  if (last && last.hash === t.hash) return { row: last, first: false, added: false };
  const prior = await db.get<{ id: number }>(
    account
      ? "SELECT id FROM terms_acceptances WHERE user_id = ? AND hash = ? LIMIT 1"
      : "SELECT id FROM terms_acceptances WHERE kind = 'sender' AND email = ? AND hash = ? LIMIT 1",
    account ? who.userId : who.email,
    t.hash,
  );
  const row = (await db.get<Acceptance>(
    `INSERT INTO terms_acceptances (kind, user_id, email, version, hash, name, accepted_at) VALUES (?,?,?,?,?,?,?) RETURNING ${COLS}`,
    account ? "account" : "sender",
    account ? who.userId : null,
    who.email,
    t.version,
    t.hash,
    name.slice(0, 200),
    now(),
  ))!;
  return { row, first: !prior, added: true };
}

/**
 * For a sender's send form: whether they must tick, whether it's because the Terms changed since their last tick
 * (`termsUpdated`, so the form can say "Updated {date}"), and the version and hash to send back with the tick.
 */
export async function senderTermsState(email: string) {
  const terms = await currentTerms();
  const last = await latestAcceptance({ email });
  const termsNeeded = !last || last.hash !== terms.hash;
  return { termsNeeded, termsUpdated: termsNeeded && !!last, termsVersion: terms.version, termsHash: terms.hash };
}

/** The archived text a stored acceptance points at (for the PDF and for disputes). */
export const archivedTerms = (hash: string) => q.get<{ version: string; body: string }>("SELECT version, body FROM terms_versions WHERE hash = ?", hash);

/**
 * The stamped PDF to attach to a sender's "Delivered" email: their latest acceptance, if its copy hasn't gone out yet
 * (so once per Terms version). The email that sends it claims it first (lib/mail.ts termsAttachment), so two emails at
 * once attach it once.
 */
export async function pendingTermsPdf(email: string, db: Queryable = q) {
  const last = await latestAcceptance({ email }, db);
  return last && last.pdf_sent_at === null ? { acceptanceId: last.id, email } : undefined;
}
