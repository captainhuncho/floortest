import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database, local storage folder and secret for this test only, set before the app's modules load.
// No email key: mail is queued in the outbox and not sent anywhere.
process.env.DATA_DIR = testDataDir("ft-vproof-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.STORAGE_DRIVER = "local";
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3]);
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF\n");
const access = (...perms: string[]) => ({ super: false as const, role: "care" as const, perms: new Set(perms) as never });
const SUPER = { super: true as const, role: "super" as const, perms: new Set<never>() };

test("pure proof rules: real type from the bytes, reason and link limits, proof required", async () => {
  const P = await import("../src/lib/verification-proof");
  assert.equal(P.sniffProof(PNG), "image/png");
  assert.equal(P.sniffProof(PDF), "application/pdf");
  assert.equal(P.sniffProof(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(P.sniffProof(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(P.sniffProof(new TextEncoder().encode("just text, named shot.png")), null, "a text file named .png is not an image");
  assert.equal(P.sniffProof(new TextEncoder().encode("<svg onload=alert(1)>")), null, "SVG is never accepted");
  assert.equal(P.cleanReason("short").ok, false);
  assert.equal(P.cleanReason("x".repeat(501)).ok, false);
  assert.equal(P.cleanReason("  known label,  matched Instagram ").ok, true);
  assert.deepEqual(P.cleanLinks("https://instagram.com/a\nhttps://soundcloud.com/a"), { ok: true, value: ["https://instagram.com/a", "https://soundcloud.com/a"] });
  for (const bad of ["http://instagram.com/a", "javascript:alert(1)", "data:text/html,x", "https://user:pw@x.com/", "instagram.com/a"])
    assert.equal(P.cleanLinks(bad).ok, false, bad);
  assert.equal(P.cleanLinks(Array.from({ length: 6 }, (_, i) => `https://x.com/${i}`).join("\n")).ok, false, "at most 5 links");
  assert.match(P.proofRefusal(0, 0)!, /Add proof/);
  assert.equal(P.proofRefusal(1, 0), null);
  assert.equal(P.proofRefusal(0, 1), null);
  assert.match(P.proofRefusal(6, 0)!, /at most 5/);
  assert.equal(P.sizeRefusal(10 * 1024 * 1024), null);
  assert.match(P.sizeRefusal(10 * 1024 * 1024 + 1)!, /10 MB or less/);
  assert.match(P.sizeRefusal(0)!, /empty/);
  assert.equal(P.cleanFileName("../../etc/passwd\u0000.png"), "....etcpasswd.png", "no slashes or control characters");
});

test("permissions: propose, direct and approve; the super admin has all; neither new one is a role default", async () => {
  const { has, ROLE_PERMS, PERMS, ACTION_NEEDS, needFor } = await import("../src/lib/ops-perms");
  const { powersOf } = await import("../src/lib/verification-proposals");
  assert.ok("verification.direct" in PERMS && "verification.approve" in PERMS, "listed, so Ops team shows them as boxes");
  for (const perms of Object.values(ROLE_PERMS)) assert.ok(!perms.some((p) => p === "verification.direct" || p === "verification.approve"));
  assert.deepEqual(powersOf(access("verification")), { propose: true, direct: false, approve: false });
  assert.deepEqual(powersOf(access("verification.direct")), { propose: true, direct: true, approve: false }, "direct includes opening Verification");
  assert.deepEqual(powersOf(access("verification.approve")), { propose: true, direct: false, approve: true });
  assert.deepEqual(powersOf(SUPER as never), { propose: true, direct: true, approve: true });
  assert.ok(!has(new Set(["verification.direct"] as const), "verification.approve"));
  assert.equal(ACTION_NEEDS.approveProposal, "verification.approve");
  assert.equal(ACTION_NEEDS.declineProposal, "verification.approve");
  assert.equal(ACTION_NEEDS.proposeVerification, "verification");
  assert.equal(needFor("/admin/verification"), "verification");
  // approveIdentity (a user's own request) checks direct or approve before anything else.
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");
  const action = src.split(/^(?=export async function )/m).find((p) => p.startsWith("export async function approveIdentity("))!;
  assert.ok(action.indexOf("if (!powers.direct && !powers.approve) return no(") < action.indexOf("approveRequest("), "refused for plain verification first");
});

test("proposals: proof required, real types, limits, four eyes, one at a time, approve emails once, decline needs a note", async () => {
  const { q } = await import("../src/lib/db");
  const V = await import("../src/lib/verification-proposals");
  const { storage } = await import("../src/lib/storage");
  const store = await storage();
  const t = Date.now();
  const user = async (handle: string, status = "none") =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, identity_status, identity_code, identity_links, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?, 'FT-ABC123', '[\"https://instagram.com/x\"]', ?) RETURNING id",
      `${handle}@vproof.io`, `${handle} Name`, handle, t, status, t,
    ))!.id;
  const care = { id: await user("carestaff"), access: access("verification") };
  const care2 = { id: await user("carestaff2"), access: access("verification") };
  const approver = { id: await user("approver"), access: access("verification", "verification.approve") };
  const artist = await user("artistone");
  const other = await user("artisttwo");
  const asker = await user("asker", "pending");

  const keyOf = (ticket: string) => (JSON.parse(Buffer.from(ticket.split(".")[0], "base64url").toString()) as { k: string }).k;
  const upload = async (adminId: number, bytes: Uint8Array, name = "shot.png", declared = bytes.length) => {
    const r = await V.startProofUpload(adminId, declared, name);
    assert.ok(r.ok, "upload started");
    await store.put(keyOf(r.ticket), bytes, "application/octet-stream");
    return r.ticket;
  };
  const why = (r: { ok: boolean }) => (r as unknown as { why: string }).why;
  const reason = "Known label; their Instagram bio links to this FloorTest page.";

  // A proposer can't verify directly or approve, whatever they send.
  assert.match(why(await V.verifyDirect(care, artist, { reason, links: "https://instagram.com/a", tickets: [] })), /permission/);

  // Proof is required: no file and no link is refused, and nothing is stored.
  assert.match(why(await V.proposeVerification(care, artist, { reason, links: "", tickets: [] })), /Add proof/);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM verification_proposals"), 0);

  // A text file named .png is refused by its first bytes; its upload is removed.
  const fake = await upload(care.id, new TextEncoder().encode("hello, I am a text file"), "shot.png");
  assert.match(why(await V.proposeVerification(care, artist, { reason, links: "", tickets: [fake] })), /isn't a PNG, JPG, WebP or PDF/);
  assert.equal(await store.head(keyOf(fake)), null, "the refused upload is deleted");

  // Size: over 10 MB can't even start; a file that doesn't match its declared size is refused.
  assert.match(why(await V.startProofUpload(care.id, 10 * 1024 * 1024 + 1, "big.png")), /10 MB or less/);
  const lying = await upload(care.id, PNG, "shot.png", PNG.length + 5);
  assert.match(why(await V.proposeVerification(care, artist, { reason, links: "", tickets: [lying] })), /changed while uploading/);
  // Count: at most 5 files.
  assert.match(why(await V.proposeVerification(care, artist, { reason, links: "", tickets: Array(6).fill("x") })), /at most 5/);
  // Tickets are bound to the person who started the upload, and can't name another key.
  const theirs = await upload(care2.id, PNG);
  assert.match(why(await V.proposeVerification(care, artist, { reason, links: "", tickets: [theirs] })), /expired/);

  // A real proposal: a PNG and a PDF, a link, a reason.
  const r1 = await V.proposeVerification(care, artist, { reason, links: "https://instagram.com/artistone", tickets: [await upload(care.id, PNG, "insta.png"), await upload(care.id, PDF, "contract.pdf")] });
  assert.ok(r1.ok, why(r1));
  const id1 = (r1 as { id: number }).id;
  const [waiting] = await V.proposalsWaiting();
  assert.equal(waiting.id, id1);
  assert.deepEqual(waiting.proofs.map((f) => [f.mime, f.original_name]), [["image/png", "insta.png"], ["application/pdf", "contract.pdf"]]);
  for (const f of await q.all<{ file_key: string }>("SELECT file_key FROM verification_proofs")) {
    assert.match(f.file_key, /^verification\/[0-9a-f-]{36}$/, "random key, no user filename");
    assert.ok(await store.head(f.file_key));
  }
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM admin_log WHERE action = 'proposed verification' AND target = '@artistone'"), 1);
  assert.equal((await q.get<{ identity_status: string }>("SELECT identity_status FROM users WHERE id = ?", artist))!.identity_status, "none", "not verified yet");

  // One pending proposal per account.
  assert.match(why(await V.proposeVerification(care2, artist, { reason, links: "https://instagram.com/x", tickets: [] })), /already a proposal waiting/);
  await assert.rejects(
    q.run("INSERT INTO verification_proposals (user_id, proposer_id, reason, status, created_at) VALUES (?, ?, ?, 'pending', ?)", artist, care2.id, reason, t),
    "the database refuses a second pending one too",
  );

  // Four eyes: the proposer can't approve their own, even holding approve.
  const selfish = { id: care.id, access: access("verification", "verification.approve") };
  assert.match(why(await V.approveProposal(selfish, id1)), /someone else has to approve/);
  // A plain proposer can't approve at all.
  assert.match(why(await V.approveProposal(care2, id1)), /permission/);

  // Approve verifies and emails once.
  const ok = await V.approveProposal(approver, id1);
  assert.ok(ok.ok, why(ok));
  assert.match(why(await V.approveProposal(approver, id1)), /already been decided/);
  const u = (await q.get<{ identity_status: string; identity_note: string }>("SELECT identity_status, identity_note FROM users WHERE id = ?", artist))!;
  assert.equal(u.identity_status, "verified");
  assert.equal(u.identity_note, reason);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE lower(to_email) = 'artistone@vproof.io'"), 1);
  const decided = (await V.proposalsFor(artist))[0];
  assert.equal(decided.status, "approved");
  assert.equal(decided.decider, "approver");
  assert.ok(decided.decided_at);

  // Decline needs a note; withdraw is the proposer's own, while pending.
  const r2 = await V.proposeVerification(care, other, { reason, links: "https://soundcloud.com/two", tickets: [] });
  const id2 = (r2 as { id: number }).id;
  assert.match(why(await V.declineProposal(approver, id2, " ")), /Say why/);
  assert.match(why(await V.withdrawProposal(care2, id2)), /Only the person who proposed it/);
  const dec = await V.declineProposal(approver, id2, "Need a screenshot of the bio");
  assert.ok(dec.ok);
  assert.equal((await V.proposalsFor(other))[0].decision_note, "Need a screenshot of the bio");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM outbox WHERE lower(to_email) = 'artisttwo@vproof.io'"), 0, "declining emails nobody");
  const r3 = await V.proposeVerification(care, other, { reason, links: "https://soundcloud.com/two", tickets: [] });
  assert.ok((await V.withdrawProposal(care, (r3 as { id: number }).id)).ok);
  assert.equal((await V.proposalsFor(other))[0].status, "withdrawn");

  // A user's own request: plain "verification" can't approve it (it adds the mark), approvers can, and it's recorded.
  assert.match(why(await V.approveRequest(care, asker)), /Forward it for approval/);
  assert.equal((await q.get<{ identity_status: string }>("SELECT identity_status FROM users WHERE id = ?", asker))!.identity_status, "pending");
  const req = await V.approveRequest(approver, asker);
  assert.ok(req.ok, why(req));
  const rec = (await V.proposalsFor(asker))[0];
  assert.equal(rec.status, "approved");
  assert.match(rec.reason, /Their own request: the bio code FT-ABC123/);
  assert.equal(rec.links, "https://instagram.com/x");
  assert.match((await q.get<{ body: string }>("SELECT body FROM outbox WHERE lower(to_email) = 'asker@vproof.io'"))!.body, /remove the code from your bio/);
});

test("the proof route: 404 alike for no permission and missing; inline, typed, never sniffed or cached", async () => {
  const { q } = await import("../src/lib/db");
  const V = await import("../src/lib/verification-proposals");
  const id = (await q.get<{ id: number }>("SELECT id FROM verification_proofs WHERE mime = 'image/png' LIMIT 1"))!.id;
  const missing = await V.proofResponse(access("verification"), "999999");
  for (const r of [await V.proofResponse(null, String(id)), await V.proofResponse(access("overview", "metrics"), String(id)), missing, await V.proofResponse(access("verification"), "abc")]) {
    assert.equal(r.status, 404);
    assert.equal(await r.text(), "Not found");
    assert.equal(r.headers.get("cache-control"), "private, no-store");
  }
  const r = await V.proofResponse(access("verification"), String(id));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.match(r.headers.get("content-disposition")!, /^inline; filename="proof-\d+\.png"$/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PNG);
});

test("erasing the account deletes its proposals, proofs and stored files", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { purgeAccount } = await import("../src/lib/privacy");
  const store = await storage();
  const artist = (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = 'artistone'"))!.id;
  const keys = (await q.all<{ file_key: string }>("SELECT f.file_key FROM verification_proofs f JOIN verification_proposals p ON p.id = f.proposal_id WHERE p.user_id = ?", artist)).map((r) => r.file_key);
  assert.equal(keys.length, 2);
  await purgeAccount(artist);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM verification_proposals WHERE user_id = ?", artist), 0);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM verification_proofs"), 0);
  for (const k of keys) assert.equal(await store.head(k), null, "file removed");
  assert.equal(await q.count(`SELECT COUNT(*)::int AS n FROM storage_deletions WHERE file_key IN (${keys.map(() => "?").join(",")})`, ...keys), 0, "nothing left queued");
  // Only the spent upload slots stay queued, until their upload links have expired (they could put a file back).
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM storage_deletions WHERE file_key NOT LIKE 'verification/incoming/%'"), 0);
  // Deleting a staff account keeps the proposals it made about others, without the name.
  const care = (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = 'carestaff'"))!.id;
  await purgeAccount(care);
  const other = (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = 'artisttwo'"))!.id;
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM verification_proposals WHERE user_id = ? AND proposer_id IS NULL", other), 2);
});
