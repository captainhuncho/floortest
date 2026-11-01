import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-person-links-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: share links, recipients and requests are found only on desks the person works", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const L = await import("../src/lib/share-links");
  const now = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('sharing', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now);
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@links.io`, handle, handle, now, now,
    ))!.id;

  const label = await user("label");
  const efua = await user("efua"); // an admin on the label's team
  const kofi = await user("kofi");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)", label, efua, now);
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Afterlife', ?) RETURNING id", label, now))!.id;
  const asEfua = { id: label, actor_id: efua };
  const fooled = { id: label, actor_id: kofi }; // the desk filter says the label, the person is someone else

  // A teammate makes a link, adds someone, and sees both, without the link's fingerprint.
  const { link } = await L.createLink(asEfua, col, { permission: "listen", days: 14, requests: true });
  assert.equal((await L.addRecipients(asEfua, link.id, "dj@club.io", "listen")).added, 1);
  const [view] = await L.linksFor(asEfua, col);
  assert.equal(view.id, link.id);
  assert.deepEqual(view.recipients.map((r) => r.value), ["dj@club.io"]);
  assert.ok(!("token_hash" in view), "the fingerprint never leaves the database for the desk");
  const recipientId = view.recipients[0].id;
  const requestId = (await q.get<{ id: number }>(
    "INSERT INTO link_requests (link_id, collection_id, email, status, created_at) VALUES (?, ?, 'ask@club.io', 'pending', ?) RETURNING id",
    link.id, col, now,
  ))!.id;

  // Someone else, even with the desk filter fooled: no link, no recipient, no request, and nothing changes.
  assert.deepEqual(await L.linksFor(fooled, col), []);
  await assert.rejects(L.createLink(fooled, col, { permission: "listen", days: 14, requests: true }), /Not found/);
  await assert.rejects(L.resetLink(fooled, link.id), /Not found/);
  await assert.rejects(L.revokeLink(fooled, link.id), /Not found/);
  await assert.rejects(L.setRequests(fooled, link.id, false), /Not found/);
  await assert.rejects(L.addRecipients(fooled, link.id, "me@evil.io", "download"), /Not found/);
  await assert.rejects(L.removeRecipient(fooled, recipientId), /Not found/);
  await assert.rejects(L.decideRequest(fooled, requestId, "approve"), /Not found/);
  const row = (await q.get<{ revoked_at: number | null; requests_on: number }>("SELECT revoked_at, requests_on FROM collection_links WHERE id = ?", link.id))!;
  assert.deepEqual(row, { revoked_at: null, requests_on: 1 });
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM link_recipients WHERE link_id = ? AND removed_at IS NULL", link.id), 1);
  assert.equal((await q.get<{ status: string }>("SELECT status FROM link_requests WHERE id = ?", requestId))!.status, "pending");

  // The person role reads links but never their fingerprint, and can't change them directly.
  await assert.rejects(asPerson(efua, () => q.get("SELECT token_hash FROM collection_links WHERE id = ?", link.id)), /permission denied/);
  await assert.rejects(asPerson(efua, () => q.run("UPDATE collection_links SET revoked_at = 1 WHERE id = ?", link.id)), /permission denied/);

  // Only the owner and admins manage links, so only they read them. A team member (who sees the collection) and a
  // listener the collection is shared with ("Shared with you") read no link, recipient or request.
  const yaw = await user("yaw"); // a member on the label's team
  const dj = await user("dj"); // added to the link by username
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, yaw, now);
  assert.equal((await L.addRecipients(asEfua, link.id, "@dj", "listen")).added, 1);
  const rows = (person: number) =>
    asPerson(person, async () => [
      await q.count("SELECT COUNT(*)::int AS n FROM collection_links"),
      await q.count("SELECT COUNT(*)::int AS n FROM link_recipients"),
      await q.count("SELECT COUNT(*)::int AS n FROM link_requests"),
    ]);
  assert.deepEqual(await rows(yaw), [0, 0, 0], "a member reads no link rows");
  assert.deepEqual(await rows(dj), [0, 0, 0], "a listener reads no link rows");
  assert.deepEqual(await rows(efua), [1, 2, 1], "an admin reads the desk's");
  assert.deepEqual(await rows(label), [1, 2, 1], "the owner reads the desk's");

  // The teammate answers the request: the lookup as the person, the change by the app.
  assert.equal((await L.decideRequest(asEfua, requestId, "decline")).status, "declined");
});

test("per-person rules: a former teammate's comment and shortlist still show, as \"Former teammate\"", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { addComment, commentsFor, shortlistOf, toggleShortlist } = await import("../src/lib/team");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@former.io`, handle, handle, now, now,
    ))!.id;
  const desk = await user("deskb");
  const ama = await user("amab");
  const kwame = await user("kwameb");
  for (const m of [ama, kwame]) await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", desk, m, now);
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@former.io', 'S', ?) RETURNING id", desk, now))!.id;
  const t = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at) VALUES (?, ?, 'tok-former', 'T', 'A', 't.wav', 'audio/wav', 1, ?) RETURNING id",
    desk, sender, now,
  ))!;
  await asPerson(kwame, () => addComment(kwame, t, "Love the break"));
  await asPerson(kwame, () => toggleShortlist(kwame, t));

  // While on the team, a teammate sees the name.
  assert.deepEqual((await asPerson(ama, () => commentsFor(t.id))).map((c) => c.name), ["kwameb"]);
  assert.equal((await asPerson(ama, () => shortlistOf(t.id)))?.name, "kwameb");

  // Kwame leaves: what he said stays on the desk, his account doesn't show.
  await q.run("DELETE FROM account_members WHERE account_id = ? AND user_id = ?", desk, kwame);
  assert.deepEqual((await asPerson(ama, () => commentsFor(t.id))).map((c) => [c.name, c.body]), [["Former teammate", "Love the break"]]);
  assert.equal((await asPerson(ama, () => shortlistOf(t.id)))?.name, "Former teammate");
});

test("the review panel reads the team's comments and shortlist through the person scope", () => {
  const panel = fs.readFileSync(new URL("../src/app/dashboard/ReviewPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /asPerson\(desk\.actor_id, \(\) => commentsFor\(t\.id\)\)/);
  assert.match(panel, /asPerson\(desk\.actor_id, \(\) => shortlistOf\(t\.id\)\)/);
});
