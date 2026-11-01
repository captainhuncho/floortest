import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only (the real ones live in Vercel). Set before the modules load.
process.env.DATA_DIR = testDataDir("ft-offline-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
const lib = () => import("../src/lib/offline");
const SESSION = "a".repeat(64);

test("an offline link names one track, desk, person and sign-in, and only lasts an hour", async () => {
  const { offlineToken, readOfflineToken, OFFLINE_LINK_MS } = await lib();
  const now = 1_800_000_000_000;
  const tok = offlineToken(42, 7, 9, SESSION, now);
  assert.deepEqual(readOfflineToken(tok, now + 1000), { trackId: 42, deskId: 7, actorId: 9, session: SESSION, expiresAt: now + OFFLINE_LINK_MS });
  assert.equal(readOfflineToken(tok, now + OFFLINE_LINK_MS + 1), null);
});

test("changing any part of a link is refused", async () => {
  const { offlineToken, readOfflineToken } = await lib();
  const now = 1_800_000_000_000;
  const [t, d, a, s, exp, sig] = offlineToken(42, 7, 9, SESSION, now).split(".");
  assert.equal(readOfflineToken([43, d, a, s, exp, sig].join("."), now), null, "another track");
  assert.equal(readOfflineToken([t, 8, a, s, exp, sig].join("."), now), null, "another desk");
  assert.equal(readOfflineToken([t, d, 10, s, exp, sig].join("."), now), null, "another person");
  assert.equal(readOfflineToken([t, d, a, "b".repeat(64), exp, sig].join("."), now), null, "another sign-in");
  assert.equal(readOfflineToken([t, d, a, s, Number(exp) + 1e9, sig].join("."), now), null, "a later expiry");
  assert.equal(readOfflineToken(`${t}.${d}.${a}.${s}.${exp}`, now), null, "no signature");
});

test("a download stops at once when the sign-in ends, the teammate leaves or the track leaves Prepare", async () => {
  const { q } = await import("../src/lib/db");
  const { offlineToken, offlineFile, OFFLINE_LINK_MS, STORAGE_LINK_SECONDS } = await lib();
  const t = Date.now();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", t);
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@x.io`, handle, handle, t, t,
    ))!.id;
  const owner = await user("owner");
  const member = await user("member");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", owner, member, t);
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", owner, t))!.id;
  const track = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, decided_at) VALUES (?,?,'T','A','tok-off','audio/o.wav','o.wav','audio/wav',1,?, 'kept', ?) RETURNING id",
    owner, sender, t, t,
  ))!.id;
  const session = async (userId: number, hash: string) =>
    q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?,?,?,?,?)", hash, userId, t + 86_400_000, t, t);
  const ownerSession = "1".repeat(64);
  const memberSession = "2".repeat(64);
  await session(owner, ownerSession);
  await session(member, memberSession);

  const ownerLink = offlineToken(track, owner, owner, ownerSession, t);
  const memberLink = offlineToken(track, owner, member, memberSession, t);
  assert.deepEqual(await offlineFile(ownerLink, t + 1000), { fileKey: "audio/o.wav", mime: "audio/wav", expiresIn: STORAGE_LINK_SECONDS }, "the owner's link works");
  assert.ok(await offlineFile(memberLink, t + 1000), "a teammate's link works while they're on the desk");
  assert.equal((await offlineFile(ownerLink, t + OFFLINE_LINK_MS - 60_000))?.expiresIn, 60, "the storage link never outlasts the offline link");
  assert.equal(await offlineFile(ownerLink, t + OFFLINE_LINK_MS), null, "expired");
  assert.equal(await offlineFile(offlineToken(track, owner, member, ownerSession, t), t + 1000), null, "someone else's sign-in");

  await q.run("DELETE FROM account_members WHERE account_id = ? AND user_id = ?", owner, member);
  assert.equal(await offlineFile(memberLink, t + 1000), null, "a teammate removed from the desk is refused at once");

  await q.run("DELETE FROM sessions WHERE token_hash = ?", ownerSession);
  assert.equal(await offlineFile(ownerLink, t + 1000), null, "signing out (or ending that session) is refused at once");

  await session(owner, ownerSession);
  await q.run("UPDATE tracks SET set_cleared_at = ? WHERE id = ?", t, track);
  assert.equal(await offlineFile(ownerLink, t + 1000), null, "a track that has left Prepare is refused");
});
