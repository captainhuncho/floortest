import "server-only";
import crypto from "node:crypto";
import { now, q, type Queryable } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { logAdmin } from "./admin-log";
import { can, type OpsAccess } from "./ops-access";
import { storage } from "./storage";
import { discardFiles } from "./deletion";
import { reserveFile, settleFile } from "./file-reservations";
import { verifiedEmail } from "./identity-direct";
import { cleanFileName, cleanLinks, cleanReason, isProofMime, PROOF_FILES_MAX, proofRefusal, sizeRefusal, sniffProof, type ProofMime } from "./verification-proof";

/**
 * Staff verification with reason and proof (owner, 1 Nov): "staff needs to verify this artist with reason and proof
 * uploaded, so the other teams can check". Who may do what:
 *   - "verification": propose (reason + proof, then someone approves), send a user's request back, remove a mark.
 *   - "verification.direct": add the mark at once, still with reason and proof.
 *   - "verification.approve": approve or decline others' proposals, and approve a user's own request.
 * The super admin has all three. Four eyes: nobody approves their own proposal, whatever they hold. Every check is
 * made here on the server, as well as by the action that calls it.
 */

export type Actor = { id: number; access: OpsAccess };
type Result = { ok: true; handle: string; id: number } | { ok: false; why: string };
const no = (why: string) => ({ ok: false as const, why });

export const powersOf = (access: OpsAccess) => ({
  propose: can(access, "verification"),
  direct: can(access, "verification.direct"),
  approve: can(access, "verification.approve"),
});

/* ───────────── Proof files ───────────── */

const INCOMING = /^verification\/incoming\/[a-f0-9]{32}$/;
const TICKET_SECONDS = 30 * 60;

const sign = (body: string) => crypto.createHmac("sha256", env.secret).update(`vproof:${body}`).digest("base64url");

/** A signed ticket naming one upload this staff member started: the only way a file key reaches a proposal. */
function ticketFor(adminId: number, key: string, size: number, name: string) {
  const body = Buffer.from(JSON.stringify({ a: adminId, k: key, s: size, n: name, e: Date.now() + TICKET_SECONDS * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

function readTicket(adminId: number, ticket: string): { key: string; size: number; name: string } | null {
  const [body, sig] = String(ticket).split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString()) as { a: number; k: string; s: number; n: string; e: number };
    if (t.a !== adminId || t.e < Date.now() || !INCOMING.test(t.k)) return null;
    return { key: t.k, size: t.s, name: t.n };
  } catch {
    return null;
  }
}

/**
 * Step 1 of a proof upload: a random key in the private bucket and a link the browser puts the file to directly (a
 * 10 MB file can't pass through a server function). The name is kept for display only, never in the key.
 */
export async function startProofUpload(adminId: number, size: number, rawName: string) {
  const bad = sizeRefusal(size);
  if (bad) return no(bad);
  const key = `verification/incoming/${crypto.randomBytes(16).toString("hex")}`;
  // Written down first: an upload never sent with a proposal is removed by the nightly check a week on.
  await reserveFile(key, "verification_proof");
  const target = await (await storage()).uploadTarget(key, "application/octet-stream", size);
  return { ok: true as const, ticket: ticketFor(adminId, key, size, cleanFileName(rawName)), ...target };
}

type Proof = { key: string; mime: ProofMime; size: number; name: string };

/**
 * Step 2: checks each uploaded file on the server (size against the ticket and the limit, real type from its first
 * bytes) and moves it to a new random key no upload link points at, stored with the type found. Any failure removes
 * every file of this batch.
 */
async function claimProofs(adminId: number, tickets: string[]): Promise<{ ok: true; files: Proof[] } | { ok: false; why: string }> {
  if (tickets.length > PROOF_FILES_MAX) return no(`Add at most ${PROOF_FILES_MAX} files`);
  const store = await storage();
  const files: Proof[] = [];
  const incoming: string[] = [];
  const fail = async (why: string) => {
    await discardFiles([...incoming, ...files.map((f) => f.key)], "verification proof refused");
    return no(why);
  };
  for (const raw of tickets) {
    const t = readTicket(adminId, raw);
    if (!t) return fail("An upload expired. Choose the files again.");
    incoming.push(t.key);
    const head = await store.head(t.key);
    if (!head) return fail("A file didn't finish uploading. Choose it again.");
    const bad = sizeRefusal(head.size) ?? (head.size !== t.size ? "A file changed while uploading. Choose it again." : null);
    if (bad) return fail(bad);
    const mime = sniffProof(await store.read(t.key, 0, 15));
    if (!mime) return fail(`"${t.name}" isn't a PNG, JPG, WebP or PDF`);
    const key = `verification/${crypto.randomUUID()}`;
    await reserveFile(key, "verification_proof");
    await store.copy(t.key, key, mime);
    files.push({ key, mime, size: head.size, name: t.name });
  }
  await discardFiles(incoming, "verification proof moved", { linkLive: true });
  return { ok: true, files };
}

/* ───────────── Proposals ───────────── */

export type ProofInput = { reason: string; links: string; tickets: string[] };

/** Reason and proof, checked before anything is stored. */
function checkInput(input: ProofInput) {
  const reason = cleanReason(input.reason);
  if (!reason.ok) return no(reason.why);
  const links = cleanLinks(input.links);
  if (!links.ok) return no(links.why);
  const bad = proofRefusal(input.tickets.length, links.value.length);
  if (bad) return no(bad);
  return { ok: true as const, reason: reason.value, links: links.value };
}

type Target = { id: number; handle: string; identity_status: string; suspended_at: number | null; email_verified_at: number | null };
const targetOf = (userId: number) =>
  q.get<Target>("SELECT id, handle, identity_status, suspended_at, email_verified_at FROM users WHERE id = ?", userId);

function targetRefusal(u: Target | undefined) {
  if (!u) return "Account not found";
  if (u.identity_status === "verified") return "That account is already verified";
  if (u.suspended_at) return "That account is suspended: restore it before verifying";
  if (!u.email_verified_at) return "They haven't confirmed their email yet, so it can't be verified";
  return null;
}

const pendingFor = (userId: number, db: Queryable = q) =>
  db.get<{ id: number; proposer_id: number | null }>("SELECT id, proposer_id FROM verification_proposals WHERE user_id = ? AND status = 'pending'", userId);

async function insertProofs(db: Queryable, proposalId: number, files: Proof[]) {
  for (const f of files)
    await db.run(
      "INSERT INTO verification_proofs (proposal_id, file_key, mime, size, original_name, created_at) VALUES (?,?,?,?,?,?)",
      proposalId, f.key, f.mime, f.size, f.name, now(),
    );
}

/**
 * Adds the mark if the account can still have it. The WHERE repeats the checks, so two staff at once (or a change in
 * between) verify once and email once. Returns what the email needs, or null.
 */
const markVerified = (db: Queryable, userId: number, note: string) =>
  db.get<{ email: string; name: string; handle: string }>(
    `UPDATE users SET identity_status = 'verified', identity_verified_at = ?, identity_note = ?
     WHERE id = ? AND identity_status <> 'verified' AND suspended_at IS NULL AND email_verified_at IS NOT NULL
     RETURNING email, name, handle`,
    now(), note, userId,
  );

class Refused extends Error {}

/** Proposers ("verification"): reason and proof, then "Send for approval". */
export async function proposeVerification(actor: Actor, userId: number, input: ProofInput): Promise<Result> {
  if (!powersOf(actor.access).propose) return no("You don't have permission to do that.");
  const checked = checkInput(input);
  if (!checked.ok) return checked;
  const u = await targetOf(userId);
  const bad = targetRefusal(u);
  if (bad) return no(bad);
  if (await pendingFor(userId)) return no(`There's already a proposal waiting for @${u!.handle}`);
  const claimed = await claimProofs(actor.id, input.tickets);
  if (!claimed.ok) return claimed;
  let id = 0;
  try {
    id = await q.tx(async (db) => {
      const row = await db.get<{ id: number }>(
        "INSERT INTO verification_proposals (user_id, proposer_id, reason, links, status, created_at) VALUES (?,?,?,?, 'pending', ?) RETURNING id",
        userId, actor.id, checked.reason, checked.links.join("\n"), now(),
      );
      await insertProofs(db, row!.id, claimed.files);
      return row!.id;
    });
  } catch {
    // The one-pending index: someone else proposed this account a moment ago.
    await discardFiles(claimed.files.map((f) => f.key), "verification proof not used");
    return no(`There's already a proposal waiting for @${u!.handle}`);
  }
  for (const f of claimed.files) await settleFile(f.key);
  await logAdmin(actor.id, "proposed verification", `@${u!.handle}`, `proposal #${id}: ${checked.reason}`);
  return { ok: true, handle: u!.handle, id };
}

/**
 * Super admin and "verification.direct": the mark straight away, with reason and proof, written as an approved
 * proposal decided by the same person. A proposal another person had waiting is closed as declined.
 */
export async function verifyDirect(actor: Actor, userId: number, input: ProofInput): Promise<Result> {
  if (!powersOf(actor.access).direct) return no("You don't have permission to verify directly. Propose it for approval instead.");
  const checked = checkInput(input);
  if (!checked.ok) return checked;
  const bad = targetRefusal(await targetOf(userId));
  if (bad) return no(bad);
  const claimed = await claimProofs(actor.id, input.tickets);
  if (!claimed.ok) return claimed;
  const t = now();
  let done: { id: number; row: { email: string; name: string; handle: string } };
  try {
    done = await q.tx(async (db) => {
      const row = await markVerified(db, userId, checked.reason);
      if (!row) throw new Refused(targetRefusal(await targetOf(userId)) ?? "That account is already verified");
      await db.run(
        "UPDATE verification_proposals SET status = 'declined', decided_by = ?, decided_at = ?, decision_note = 'Verified directly instead' WHERE user_id = ? AND status = 'pending'",
        actor.id, t, userId,
      );
      const p = await db.get<{ id: number }>(
        "INSERT INTO verification_proposals (user_id, proposer_id, reason, links, status, created_at, decided_by, decided_at) VALUES (?,?,?,?, 'approved', ?,?,?) RETURNING id",
        userId, actor.id, checked.reason, checked.links.join("\n"), t, actor.id, t,
      );
      await insertProofs(db, p!.id, claimed.files);
      return { id: p!.id, row };
    });
  } catch (e) {
    await discardFiles(claimed.files.map((f) => f.key), "verification proof not used");
    if (e instanceof Refused) return no(e.message);
    throw e;
  }
  for (const f of claimed.files) await settleFile(f.key);
  await sendMail({ userId, audience: "receiver", to: done.row.email, ...(await verifiedEmail(done.row, "direct")) });
  await logAdmin(actor.id, "verified identity (no request)", `@${done.row.handle}`, `proposal #${done.id}: ${checked.reason}`);
  return { ok: true, handle: done.row.handle, id: done.id };
}

/** Approvers: the proposal's mark, the "verified" email once, and who decided. Never the proposer's own. */
export async function approveProposal(actor: Actor, proposalId: number): Promise<Result> {
  if (!powersOf(actor.access).approve) return no("You don't have permission to approve proposals.");
  return approveAs(actor.id, proposalId);
}

/** Approving, once the caller's permission is checked. The four-eyes rule is enforced here, in the WHERE too. */
async function approveAs(actorId: number, proposalId: number): Promise<Result> {
  const actor = { id: actorId };
  const p = await q.get<{ user_id: number; proposer_id: number | null; status: string; was: string }>(
    "SELECT p.user_id, p.proposer_id, p.status, u.identity_status AS was FROM verification_proposals p JOIN users u ON u.id = p.user_id WHERE p.id = ?",
    proposalId,
  );
  if (!p || p.status !== "pending") return no("That proposal has already been decided");
  if (p.proposer_id === actor.id) return no("You proposed this one, so someone else has to approve it");
  let row: { email: string; name: string; handle: string };
  try {
    row = await q.tx(async (db) => {
      const claimed = await db.get(
        "UPDATE verification_proposals SET status = 'approved', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending' AND proposer_id IS DISTINCT FROM ? RETURNING id",
        actor.id, now(), proposalId, actor.id,
      );
      if (!claimed) throw new Refused("That proposal has already been decided");
      const reason = (await db.get<{ reason: string }>("SELECT reason FROM verification_proposals WHERE id = ?", proposalId))!.reason;
      const r = await markVerified(db, p.user_id, reason);
      if (!r) throw new Refused(targetRefusal(await targetOf(p.user_id)) ?? "That account is already verified");
      return r;
    });
  } catch (e) {
    if (e instanceof Refused) return no(e.message);
    throw e;
  }
  // After their own request, the email says they can take the code out of their bio.
  await sendMail({ userId: p.user_id, audience: "receiver", to: row.email, ...(await verifiedEmail(row, p.was === "pending" ? "request" : "direct")) });
  await logAdmin(actor.id, "approved verification proposal", `@${row.handle}`, `proposal #${proposalId}`);
  return { ok: true, handle: row.handle, id: proposalId };
}

/** Approvers: a declined proposal keeps its note, so the proposer and other teams see why. Nothing is emailed. */
export async function declineProposal(actor: Actor, proposalId: number, rawNote: string): Promise<Result> {
  if (!powersOf(actor.access).approve) return no("You don't have permission to decline proposals.");
  const note = rawNote.trim().replace(/\s+/g, " ");
  if (note.length < 2) return no("Say why it's declined, so the proposer knows what's missing");
  if (note.length > 500) return no("Keep the note under 500 characters");
  const row = await q.get<{ handle: string }>(
    `UPDATE verification_proposals p SET status = 'declined', decided_by = ?, decided_at = ?, decision_note = ?
     FROM users u WHERE p.id = ? AND p.status = 'pending' AND u.id = p.user_id RETURNING u.handle`,
    actor.id, now(), note, proposalId,
  );
  if (!row) return no("That proposal has already been decided");
  await logAdmin(actor.id, "declined verification proposal", `@${row.handle}`, `proposal #${proposalId}: ${note}`);
  return { ok: true, handle: row.handle, id: proposalId };
}

/** Proposers: take back their own proposal while it's waiting. */
export async function withdrawProposal(actor: Actor, proposalId: number): Promise<Result> {
  if (!powersOf(actor.access).propose) return no("You don't have permission to do that.");
  const row = await q.get<{ handle: string }>(
    `UPDATE verification_proposals p SET status = 'withdrawn', decided_by = ?, decided_at = ?
     FROM users u WHERE p.id = ? AND p.status = 'pending' AND p.proposer_id = ? AND u.id = p.user_id RETURNING u.handle`,
    actor.id, now(), proposalId, actor.id,
  );
  if (!row) return no("Only the person who proposed it can withdraw it, while it's waiting");
  await logAdmin(actor.id, "withdrew verification proposal", `@${row.handle}`, `proposal #${proposalId}`);
  return { ok: true, handle: row.handle, id: proposalId };
}

/**
 * Approving someone's own request (bio code found) also adds the mark, so it needs "verification.direct" or
 * "verification.approve". If a colleague forwarded the request as a proposal, approving the request approves that
 * proposal (four eyes apply). Otherwise the request itself is recorded as an approved proposal: the reason is the bio
 * code, the links are the profiles they gave.
 */
export async function approveRequest(actor: Actor, userId: number): Promise<Result> {
  const powers = powersOf(actor.access);
  if (!powers.direct && !powers.approve) return no("Approving adds the Verified mark. Forward it for approval with your reason and proof instead.");
  const forwarded = await pendingFor(userId);
  if (forwarded) return approveAs(actor.id, forwarded.id);
  const t = now();
  let row: { email: string; name: string; handle: string; id: number };
  try {
    row = await q.tx(async (db) => {
      const u = await db.get<{ identity_links: string; identity_code: string | null }>("SELECT identity_links, identity_code FROM users WHERE id = ?", userId);
      const reason = `Their own request: the bio code${u?.identity_code ? ` ${u.identity_code}` : ""} was found in a profile they linked.`;
      const r = await markVerified(db, userId, "");
      if (!r || !u) throw new Refused(targetRefusal(await targetOf(userId)) ?? "Account not found");
      const links = (() => {
        try {
          return (JSON.parse(u.identity_links || "[]") as string[]).filter((l) => typeof l === "string" && l.startsWith("https://")).slice(0, 5);
        } catch {
          return [];
        }
      })();
      const p = await db.get<{ id: number }>(
        "INSERT INTO verification_proposals (user_id, proposer_id, reason, links, status, created_at, decided_by, decided_at) VALUES (?, NULL, ?, ?, 'approved', ?, ?, ?) RETURNING id",
        userId, reason, links.join("\n"), t, actor.id, t,
      );
      return { ...r, id: p!.id };
    });
  } catch (e) {
    if (e instanceof Refused) return no(e.message);
    throw e;
  }
  await sendMail({ userId, audience: "receiver", to: row.email, ...(await verifiedEmail(row, "request")) });
  await logAdmin(actor.id, "verified identity", `@${row.handle}`, `proposal #${row.id}`);
  return { ok: true, handle: row.handle, id: row.id };
}

/* ───────────── Reading ───────────── */

export type ProofRow = { id: number; proposal_id: number; mime: ProofMime; size: number; original_name: string };
export type ProposalRow = {
  id: number;
  user_id: number;
  handle: string;
  name: string;
  proposer_id: number | null;
  proposer: string | null;
  reason: string;
  links: string;
  status: "pending" | "approved" | "declined" | "withdrawn";
  created_at: number;
  decider: string | null;
  decided_at: number | null;
  decision_note: string;
  proofs: ProofRow[];
};

async function withProofs(rows: Omit<ProposalRow, "proofs">[]): Promise<ProposalRow[]> {
  if (!rows.length) return [];
  const marks = rows.map(() => "?").join(",");
  const proofs = await q.all<ProofRow>(
    `SELECT id, proposal_id, mime, size, original_name FROM verification_proofs WHERE proposal_id IN (${marks}) ORDER BY id`,
    ...rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, proofs: proofs.filter((f) => Number(f.proposal_id) === Number(r.id)) }));
}

const PROPOSAL_COLS = `p.id, p.user_id, u.handle, u.name, p.proposer_id, pu.handle AS proposer, p.reason, p.links, p.status, p.created_at,
  du.handle AS decider, p.decided_at, p.decision_note
  FROM verification_proposals p JOIN users u ON u.id = p.user_id
  LEFT JOIN users pu ON pu.id = p.proposer_id LEFT JOIN users du ON du.id = p.decided_by`;

/** Verification → "Proposals waiting", oldest first. */
export const proposalsWaiting = async (limit = 50) =>
  withProofs(await q.all(`SELECT ${PROPOSAL_COLS} WHERE p.status = 'pending' ORDER BY p.created_at LIMIT ?`, limit));

/** The account page's history: every proposal for this account, newest first. */
export const proposalsFor = async (userId: number, limit = 30) =>
  withProofs(await q.all(`SELECT ${PROPOSAL_COLS} WHERE p.user_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT ?`, userId, limit));

/**
 * /api/admin/verification-proofs/[id]: the file itself, only for someone with "verification". Missing and forbidden
 * answer the same 404. Served as the type found when it was checked, inline for viewing, never sniffed or cached.
 */
export async function proofResponse(access: OpsAccess | null, rawId: string): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  if (!access || !can(access, "verification")) return notFound();
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return notFound();
  const f = await q.get<{ file_key: string; mime: string }>("SELECT file_key, mime FROM verification_proofs WHERE id = ?", id);
  if (!f || !isProofMime(f.mime)) return notFound();
  const store = await storage();
  const head = await store.head(f.file_key);
  if (!head) return notFound();
  const { body } = await store.stream(f.file_key);
  return new Response(body, {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(head.size),
      "Content-Disposition": `inline; filename="proof-${id}.${f.mime === "application/pdf" ? "pdf" : f.mime.split("/")[1]}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      // Nothing in the file may load or run anything, or be framed by another site.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    },
  });
}
