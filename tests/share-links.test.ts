import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-links-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

let ready: ReturnType<typeof makeSetup> | undefined;
const setup = () => (ready ??= makeSetup());

async function makeSetup() {
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
  return { q, owner: { id: owner, actor_id: owner }, mate, col, shared, privateTrack: await track("Private", 0), oldModel };
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
    const o = (await q.get<{ id: number; actor_id: number }>("SELECT id, id AS actor_id FROM users WHERE handle = 'owner'"))!;
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
  const o = (await q.get<{ id: number; actor_id: number }>("SELECT id, id AS actor_id FROM users WHERE handle = 'owner'"))!;
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
  const o = (await q.get<{ id: number; actor_id: number }>("SELECT id, id AS actor_id FROM users WHERE handle = 'owner'"))!;
  const col = (await q.get<{ id: number }>("SELECT id FROM collections WHERE user_id = ?", o.id))!.id;
  const DAY = 86_400_000;

  // The artist stops sharing: the track leaves every link at once, and the owner sees why.
  const { link, url } = await L.createLink(o, col, { permission: "listen", days: null, requests: true });
  const live = (await L.linkBySecret(url.split("/c/")[1]))!;
  const shared = (await L.linkTracks(live))[0];
  assert.ok(shared);
  // The receipt key is the sender's, never handed to someone opening the link (LINK_TRACK_COLUMNS).
  const { token } = (await q.get<{ token: string }>("SELECT token FROM tracks WHERE id = ?", shared.id))!;
  assert.equal(await L.stopSharingByReceipt(token), true);
  assert.equal(await L.linkTrack(live, shared.id), undefined);
  assert.equal(await L.stopSharingByReceipt(token), false, "once");
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

test("guesses sent at the same moment can't get past five tries on a share-link code", async () => {
  const L = await import("../src/lib/share-links");
  const { q, owner, col } = await setup();
  const { url } = await L.createLink(owner, col, { permission: "listen", days: 14, requests: true });
  const live = (await L.linkBySecret(url.split("/c/")[1]))!;
  await L.addRecipients(owner, live.id, "race@x.io", "listen");
  let sent = "";
  await L.sendLinkCode(live, "race@x.io", "2.2.2.2", async (_to, code) => void (sent = code));
  const wrong = sent.replace(/./g, (d) => String((Number(d) + 1) % 10));
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => L.checkLinkCode(live, "race@x.io", wrong)));
  const wrongTold = results.filter((r) => r.status === "rejected" && /isn't right/.test(String(r.reason?.message)));
  assert.equal(wrongTold.length, 4, "tries 1 to 4 are compared and told; the fifth uses it up; the rest are turned away");
  const row = (await q.get<{ attempts: number }>("SELECT attempts FROM link_codes WHERE link_id = ? AND email = 'race@x.io'", live.id))!;
  assert.equal(row.attempts, 5, "never more than five tries counted");
  await assert.rejects(L.checkLinkCode(live, "race@x.io", sent), /Too many wrong tries/, "the right code no longer works after five wrong ones");
});

// Rule 2 (audit 27 Oct): a share link is the one path where one person's tracks reach someone else, so it returns
// named columns only: nothing about the sender (name, email, message, receipt key) or the owner's notes.
test("a share link hands over only the named track columns", async () => {
  const L = await import("../src/lib/share-links");
  const { q, owner, col } = await setup();
  // A fresh shareable track (the test above stopped sharing the first one).
  const shared = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at, share_ok, share_terms, message) SELECT user_id, sender_id, collection_id, 'Columns', 'A', 'tok-Columns', file_key, original_name, mime, size, created_at, 1, 'test', 'a private note' FROM tracks WHERE collection_id = ? LIMIT 1 RETURNING id",
    col,
  ))!.id;
  const { url } = await L.createLink(owner, col, { permission: "listen", days: 14, requests: true });
  const live = (await L.linkBySecret(url.split("/c/")[1]))!;
  const want = ["artist", "bpm", "duration", "file_key", "genre", "id", "mime", "title"];
  const listed = (await L.linkTracks(live)).find((t) => t.id === shared)!;
  assert.deepEqual(Object.keys(listed).sort(), want);
  assert.deepEqual(Object.keys((await L.linkTrack(live, shared))!).sort(), want);
  assert.deepEqual([...L.LINK_TRACK_COLUMNS].sort(), want);
});

test("the owner's link list groups each link's people, requests and latest 12 events, in four queries for all links", async () => {
  const L = await import("../src/lib/share-links");
  const { q, owner, col } = await setup();
  const a = (await L.createLink(owner, col, { permission: "listen", days: 14, requests: true, label: "A" })).link;
  const b = (await L.createLink(owner, col, { permission: "download", days: 14, requests: true, label: "B" })).link;
  await L.addRecipients(owner, a.id, "one@a.io", "listen");
  await L.addRecipients(owner, b.id, "two@b.io, three@b.io", "download");
  const ask = (linkId: number, email: string) =>
    q.run("INSERT INTO link_requests (link_id, collection_id, email, name, note, status, created_at) VALUES (?,?,?, '', '', 'pending', ?)", linkId, col, email, Date.now());
  await ask(a.id, "ask@a.io");
  await ask(b.id, "ask1@b.io");
  await ask(b.id, "ask2@b.io");
  for (let i = 0; i < 15; i++) await L.logLinkEvent(a.id, "listened", { email: "one@a.io", userId: null }, null);
  await L.logLinkEvent(b.id, "downloaded", { email: "two@b.io", userId: null }, null);

  const view = await L.linksFor(owner, col);
  const va = view.find((l) => l.id === a.id)!;
  const vb = view.find((l) => l.id === b.id)!;
  assert.deepEqual(va.recipients.map((r) => r.value), ["one@a.io"]);
  assert.deepEqual(vb.recipients.map((r) => r.value).sort(), ["three@b.io", "two@b.io"]);
  assert.deepEqual(va.requests.map((r) => r.email), ["ask@a.io"]);
  assert.deepEqual(vb.requests.map((r) => r.email), ["ask1@b.io", "ask2@b.io"]);
  assert.equal(va.events.filter((e) => e.kind === "listened").length, 12, "only the latest 12 per link");
  assert.deepEqual(vb.events.filter((e) => e.kind === "downloaded").map((e) => e.email), ["two@b.io"], "one link's events never show on another");
  assert.ok(!("link_id" in va.requests[0]) && !("link_id" in va.events[0]));

  // Someone else's collection: nothing.
  assert.deepEqual(await L.linksFor({ id: owner.id + 999, actor_id: owner.id + 999 }, col), []);
});
