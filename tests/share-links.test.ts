import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-links-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

async function setup() {
  const { q } = await import("../src/lib/db");
  const now = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('sharing', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now);
  const user = async (handle: string, verified = true) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@acct.io`, handle, handle, verified ? now : null, now,
    ))!.id;
  const owner = await user("owner");
  const mate = await user("mate");
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Afterlife', ?) RETURNING id", owner, now))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, now))!.id;
  const track = async (title: string, shareOk: number) =>
    (await q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at, share_ok) VALUES (?,?,?,?,'A',?,'audio/x.wav','x.wav','audio/wav',1,?,?) RETURNING id",
      owner, sender, col, title, `tok-${title}`, now, shareOk,
    ))!.id;
  return { q, owner: { id: owner }, mate, col, shared: await track("Shared", 1), privateTrack: await track("Private", 0) };
}

test("share links: own address, named recipients, codes, sessions, reset, revoke, tracks", async () => {
  const L = await import("../src/lib/share-links");
  const { q, owner, mate, col, shared, privateTrack } = await setup();

  const { link, url } = await L.createLink(owner, col, { permission: "listen", days: 14, requests: true });
  const secret = url.split("/c/")[1];
  assert.equal((await L.linkBySecret(secret))?.id, link.id);
  const stored = (await q.get<{ token_hash: string }>("SELECT token_hash FROM collection_links WHERE id = ?", link.id))!.token_hash;
  assert.notEqual(stored, secret);
  assert.equal(await L.linkBySecret(stored), undefined, "the stored fingerprint isn't a working address");

  // Mixed list: an email, a company domain, a username; personal domains and junk refused.
  const added = await L.addRecipients(owner, link.id, "a@x.io, @label.com\n@gmail.com @mate junk!", "download");
  assert.equal(added.added, 3);
  assert.equal(added.problems.length, 2);
  const live = (await L.linkBySecret(secret))!;
  assert.equal((await L.recipientFor(live, { email: "A@x.io", userId: null }))?.permission, "listen", "never more than the link allows");
  assert.ok(await L.recipientFor(live, { email: "boss@label.com", userId: null }));
  assert.equal(await L.recipientFor(live, { email: "stranger@other.io", userId: null }), undefined);
  assert.ok(await L.recipientFor(live, { email: null, userId: mate }), "the account, signed in");
  assert.ok(await L.recipientFor(live, { email: "mate@acct.io", userId: null }), "the account's confirmed email, by code");

  // Codes: wrong, then right, then used up.
  let sentCode = "";
  await L.sendLinkCode(live, "a@x.io", "1.1.1.1", async (_to, code) => void (sentCode = code));
  await assert.rejects(L.checkLinkCode(live, "a@x.io", "000000".replace(/./g, (d, i) => String((Number(sentCode[i]) + 1) % 10))));
  assert.equal(await L.checkLinkCode(live, "a@x.io", sentCode), "a@x.io");
  await assert.rejects(L.checkLinkCode(live, "a@x.io", sentCode), "a code works once");

  // A session works until the person is removed, or the link is reset.
  const r = (await L.recipientFor(live, { email: "a@x.io", userId: null }))!;
  const s1 = await L.startLinkSession(live, r.recipient, { email: "a@x.io", userId: null });
  assert.ok(await L.linkSession(live, s1.secret));
  await L.removeRecipient(owner, r.recipient.id);
  assert.equal(await L.linkSession(live, s1.secret), undefined, "removing a person ends their access at once");
  assert.equal(await L.recipientFor(live, { email: "a@x.io", userId: null }), undefined);

  const d = (await L.recipientFor(live, { email: "boss@label.com", userId: null }))!;
  const s2 = await L.startLinkSession(live, d.recipient, { email: "boss@label.com", userId: null });
  const newUrl = await L.resetLink(owner, link.id);
  assert.equal(await L.linkBySecret(secret), undefined, "reset: the old address stops working");
  const after = (await L.linkBySecret(newUrl.split("/c/")[1]))!;
  assert.equal(await L.linkSession(after, s2.secret), undefined, "reset: everyone signed in through it is signed out");

  // Only tracks whose sender agreed to sharing are reachable.
  assert.deepEqual((await L.linkTracks(after)).map((t) => t.id), [shared]);
  assert.equal(await L.linkTrack(after, privateTrack), undefined);

  await L.revokeLink(owner, link.id);
  assert.equal(await L.linkBySecret(newUrl.split("/c/")[1]), undefined, "revoked for good");
});

test("requests to join: one waiting, decline cooldown, approve with less than the link, daily cap, leak pause", async () => {
  const L = await import("../src/lib/share-links");
  const { owner, col } = await setup().catch(async () => {
    // Second test in the same database: reuse the owner and collection.
    const { q } = await import("../src/lib/db");
    const o = (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = 'owner'"))!;
    return { owner: o, col: (await q.get<{ id: number }>("SELECT id FROM collections WHERE user_id = ?", o.id))!.id };
  });
  const { link, url } = await L.createLink(owner, col, { permission: "download", days: 14, requests: true });
  const live = (await L.linkBySecret(url.split("/c/")[1]))!;
  const ask = (email: string, ip = "9.9.9.9") => L.requestAccess(live, { email, userId: null, name: "Sam", note: "A&R", ip });

  assert.equal((await ask("sam@label2.io")).status, "sent");
  assert.equal((await ask("sam@label2.io")).status, "waiting", "one waiting request per email per link");

  const { q } = await import("../src/lib/db");
  const reqId = async (email: string) => (await q.get<{ id: number }>("SELECT id FROM link_requests WHERE email = ? ORDER BY id DESC LIMIT 1", email))!.id;
  await L.decideRequest(owner, await reqId("sam@label2.io"), "decline");
  await assert.rejects(ask("sam@label2.io"), /can't request/, "30-day cooldown after a decline");

  await ask("kim@label2.io", "8.8.8.8");
  await L.decideRequest(owner, await reqId("kim@label2.io"), "approve", { permission: "listen", days: 7 });
  assert.equal((await L.recipientFor(live, { email: "kim@label2.io", userId: null }))?.permission, "listen", "the owner can give less than the link");

  // Two a day per email, whatever the link.
  const { link: other, url: otherUrl } = await L.createLink(owner, col, { permission: "listen", days: 14, requests: true });
  void other;
  const live2 = (await L.linkBySecret(otherUrl.split("/c/")[1]))!;
  assert.equal((await L.requestAccess(live2, { email: "kim@label2.io", userId: null, name: "", note: "", ip: "7.7.7.7" })).status, "sent", "second request today");
  const { url: thirdUrl } = await L.createLink(owner, col, { permission: "listen", days: 14, requests: true });
  const live3 = (await L.linkBySecret(thirdUrl.split("/c/")[1]))!;
  await assert.rejects(L.requestAccess(live3, { email: "kim@label2.io", userId: null, name: "", note: "", ip: "6.6.6.6" }), /tomorrow/, "a third today is refused");

  // A pile of waiting requests pauses the link (it may have leaked).
  for (let i = 0; i < 20; i++) await L.requestAccess(live2, { email: `fan${i}@leak.io`, userId: null, name: "", note: "", ip: `10.0.0.${i}` }).catch(() => {});
  const paused = (await L.linkBySecret(otherUrl.split("/c/")[1]))!;
  assert.ok(paused.requests_paused_at, "requests pause at 20 waiting");
  await assert.rejects(L.requestAccess(paused, { email: "late@leak.io", userId: null, name: "", note: "", ip: "10.1.1.1" }), /isn't taking requests/);
  void link;
});
