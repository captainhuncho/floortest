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
      "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at, share_ok, share_terms) VALUES (?,?,?,?,'A',?,'audio/x.wav','x.wav','audio/wav',1,?,?,?) RETURNING id",
      owner, sender, col, title, `tok-${title}`, now, shareOk, shareOk ? "test" : null,
    ))!.id;
  const shared = await track("Shared", 1);
  // Sent under the 1 Oct colleague wording: shareable then, but not through collection links.
  const oldModel = await track("Old", 1);
  await q.run("UPDATE tracks SET share_terms = NULL WHERE id = ?", oldModel);
  return { q, owner: { id: owner }, mate, col, shared, privateTrack: await track("Private", 0), oldModel };
}

test("share links: own address, named recipients, codes, sessions, reset, revoke, tracks", async () => {
  const L = await import("../src/lib/share-links");
  const { q, owner, mate, col, shared, privateTrack, oldModel } = await setup();

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
  assert.ok(await L.linkSession(live, s1.secret, null));
  await L.removeRecipient(owner, r.recipient.id);
  assert.equal(await L.linkSession(live, s1.secret, null), undefined, "removing a person ends their access at once");
  assert.equal(await L.recipientFor(live, { email: "a@x.io", userId: null }), undefined);

  const d = (await L.recipientFor(live, { email: "boss@label.com", userId: null }))!;
  const s2 = await L.startLinkSession(live, d.recipient, { email: "boss@label.com", userId: null });
  const newUrl = await L.resetLink(owner, link.id);
  assert.equal(await L.linkBySecret(secret), undefined, "reset: the old address stops working");
  const after = (await L.linkBySecret(newUrl.split("/c/")[1]))!;
  assert.equal(await L.linkSession(after, s2.secret, null), undefined, "reset: everyone signed in through it is signed out");

  // Only tracks whose sender agreed to sharing are reachable.
  assert.deepEqual((await L.linkTracks(after)).map((t) => t.id), [shared]);
  assert.equal(await L.linkTrack(after, privateTrack), undefined);
  assert.equal(await L.linkTrack(after, oldModel), undefined, "tracks sent before the new wording aren't shared");

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

test("account holders: open by number while signed in, Shared with you, activity, and probing warnings", async () => {
  const L = await import("../src/lib/share-links");
  const { q } = await import("../src/lib/db");
  const o = (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = 'owner'"))!;
  const col = (await q.get<{ id: number }>("SELECT id FROM collections WHERE user_id = ?", o.id))!.id;
  const viewer = async (handle: string) => (await q.get<{ id: number; email: string; email_verified_at: number | null }>("SELECT id, email, email_verified_at FROM users WHERE handle = ?", handle))!;
  const mate = await viewer("mate");
  const ownerV = await viewer("owner");
  const { link } = await L.createLink(o, col, { permission: "download", days: null, requests: false });
  const key = L.accountLinkPath(link.id).split("/c/")[1];

  // Not on the list yet: the number opens nothing, for anyone (signed out, or the owner).
  assert.equal(await L.linkByKey(key, mate), undefined);
  assert.equal(await L.linkByKey(key, null), undefined);
  assert.equal(await L.linkByKey(key, ownerV), undefined);
  const r = await L.addRecipients(o, link.id, "@mate", "download");
  assert.deepEqual(r.accounts, [mate.id]);
  const open = (await L.linkByKey(key, mate))!;
  assert.equal(open.id, link.id);
  assert.equal(await L.linkByKey(key, { ...mate, email_verified_at: null }), undefined, "a confirmed email is needed");
  const listed = await L.sharedLinksFor(mate);
  assert.deepEqual(listed.map((x) => [x.id, x.permission, x.count]), [[link.id, "download", 1]]);

  // A visit opened by the account ends when that account isn't the one signed in.
  const m = (await L.recipientFor(open, { email: mate.email, userId: mate.id }))!;
  const s = await L.startLinkSession(open, m.recipient, { email: mate.email, userId: mate.id });
  assert.ok(await L.linkSession(open, s.secret, mate.id));
  assert.equal(await L.linkSession(open, s.secret, null), undefined, "signed out: the visit ends too");
  assert.equal(await L.linkSession(open, s.secret, ownerV.id), undefined);

  // Activity per person.
  await L.logLinkEvent(link.id, "listened", { email: mate.email, userId: mate.id }, null);
  await L.logLinkEvent(link.id, "downloaded", { email: mate.email, userId: mate.id }, null);
  const view = (await L.linksFor(o, col)).find((l) => l.id === link.id)!;
  assert.deepEqual([view.recipients[0].visits, view.recipients[0].downloaded], [1, 1]);
  const notices = await L.linkNoticesFor(o.id, 0);
  assert.ok(notices.some((n) => n.kind === "verified" && n.email === mate.email));
  assert.ok(notices.some((n) => n.kind === "downloaded"));

  // Codes for addresses not on the list: one warning once ten pile up in an hour, then quiet for a day.
  const fires: boolean[] = [];
  for (let i = 0; i < 12; i++) fires.push(await L.noteUnlistedCode(open, `p${i}@probe.io`));
  assert.deepEqual(fires.map((f, i) => (f ? i : -1)).filter((i) => i >= 0), [9]);
  assert.equal(await L.noteUnlistedCode(open, mate.email), false, "people on the list don't count");
  assert.ok((await L.linkNoticesFor(o.id, 0)).some((n) => n.kind === "probed"));

  // Removing the account takes it off Shared with you at once.
  await L.removeRecipient(o, m.recipient.id);
  assert.equal(await L.linkByKey(key, mate), undefined);
  assert.deepEqual(await L.sharedLinksFor(mate), []);
});

test("retention, account deletion and the artist's stop switch", async () => {
  const L = await import("../src/lib/share-links");
  const { q } = await import("../src/lib/db");
  const o = (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = 'owner'"))!;
  const col = (await q.get<{ id: number }>("SELECT id FROM collections WHERE user_id = ?", o.id))!.id;
  const DAY = 86_400_000;

  // The artist stops sharing: the track leaves every link at once, and the owner sees why.
  const { link, url } = await L.createLink(o, col, { permission: "listen", days: null, requests: true });
  const live = (await L.linkBySecret(url.split("/c/")[1]))!;
  const shared = (await L.linkTracks(live))[0];
  assert.ok(shared);
  assert.equal(await L.stopSharingByReceipt(shared.token), true);
  assert.equal(await L.linkTrack(live, shared.id), undefined);
  assert.equal(await L.stopSharingByReceipt(shared.token), false, "once");
  assert.ok(await q.get("SELECT 1 FROM link_events WHERE link_id = ? AND kind = 'sender_stopped' AND track_id = ?", link.id, shared.id));

  // Once the track has left the desk the switch answers the same, so the receipt doesn't give the removal away.
  const gone = (await q.get<{ id: number; token: string }>(
    "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at, share_ok, share_terms, deleted_at) SELECT user_id, sender_id, collection_id, 'Gone', 'A', 'tok-Gone', file_key, original_name, mime, size, created_at, 1, 'test', ? FROM tracks WHERE id = ? RETURNING id, token",
    Date.now(), shared.id,
  ))!;
  assert.equal(await L.stopSharingByReceipt(gone.token), true);
  assert.equal(await q.get("SELECT 1 FROM link_events WHERE track_id = ?", gone.id), undefined);

  // Account deletion: off other people's lists, and their visits and activity gone.
  const mate = (await q.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE handle = 'mate'"))!;
  await L.addRecipients(o, link.id, "@mate", "listen");
  const m = (await L.recipientFor(live, { email: mate.email, userId: mate.id }))!;
  await L.startLinkSession(live, m.recipient, { email: mate.email, userId: mate.id });
  await q.tx((db) => L.forgetLinkPerson(db, mate.id, mate.email));
  assert.equal(await L.recipientFor(live, { email: mate.email, userId: mate.id }), undefined);
  assert.equal(await q.get("SELECT 1 FROM link_events WHERE email = ? OR user_id = ?", mate.email, mate.id), undefined);
  assert.equal(await q.get("SELECT 1 FROM link_sessions WHERE user_id = ?", mate.id), undefined);

  // Retention: stale codes and probe notes go; a link that ended over a year ago goes with everything on it.
  await L.sendLinkCode(live, "old@x.io", "2.2.2.2", async () => {});
  await L.logLinkEvent(link.id, "code_unlisted", { email: "probe@x.io" });
  const later = Date.now() + 3 * DAY;
  const r1 = await L.purgeLinkRecords(later);
  assert.ok(r1.codes >= 1 && r1.notes >= 1);
  assert.ok(await q.get("SELECT 1 FROM collection_links WHERE id = ?", link.id), "a live link stays");
  await L.revokeLink(o, link.id);
  assert.equal((await L.purgeLinkRecords(Date.now() + 30 * DAY)).links, 0, "a recently ended link stays");
  assert.ok((await L.purgeLinkRecords(Date.now() + 400 * DAY)).links >= 1);
  assert.equal(await q.get("SELECT 1 FROM collection_links WHERE id = ?", link.id), undefined);
  assert.equal(await q.get("SELECT 1 FROM link_events WHERE link_id = ?", link.id), undefined);
});
