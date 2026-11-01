import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-person-team-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: Review Together comments, shortlist and a single move stay on desks the person works", async () => {
  const { q, asPerson, logEvent } = await import("../src/lib/db");
  const { addComment, removeComment, reviewTrack, toggleShortlist } = await import("../src/lib/team");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@team.io`, handle, handle, now, now,
    ))!.id;
  const track = async (desk: number) => {
    const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", desk, `s${desk}-${Math.random()}@send.io`, now))!.id;
    return (await q.get<{ id: number; sender_id: number }>(
      "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at) VALUES (?, ?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?) RETURNING id, sender_id",
      desk, sender, `tok-${desk}-${Math.random()}`, now,
    ))!;
  };
  const collection = async (desk: number) =>
    (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Friday', ?) RETURNING id", desk, now))!.id;
  const comments = (trackId: number) => q.all<{ id: number; user_id: number }>("SELECT id, user_id FROM track_comments WHERE track_id = ? ORDER BY id", trackId);

  const label = await user("label");
  const efua = await user("efua"); // a member of the label's team
  const kofi = await user("kofi");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, efua, now);
  const labelTrack = await track(label);
  const kofiTrack = await track(kofi);
  const desk = { id: label, actor_id: efua, role: "member" as const };

  // A teammate finds the team desk's track and comments, signed as themself.
  const t = await asPerson(efua, () => reviewTrack({ id: label }, labelTrack.id));
  assert.equal(t?.id, labelTrack.id);
  await asPerson(efua, () => addComment(efua, t!, "Big drop"));
  assert.deepEqual((await comments(labelTrack.id)).map((c) => c.user_id), [efua]);

  // Another desk's track isn't found, even with the desk filter fooled, and can't take a comment or a shortlist.
  assert.equal(await asPerson(efua, () => reviewTrack({ id: kofi }, kofiTrack.id)), undefined);
  await assert.rejects(asPerson(efua, () => addComment(efua, kofiTrack, "hi")), /row-level security/);
  await assert.rejects(asPerson(efua, () => toggleShortlist(efua, kofiTrack)), /row-level security/);
  // A comment can't be signed as someone else.
  await assert.rejects(asPerson(efua, () => addComment(label, t!, "forged")), /row-level security/);

  // The owner's comment: the member can't remove it; the owner can remove the member's (override).
  await asPerson(label, () => addComment(label, t!, "Keep it"));
  const [mine, owners] = await comments(labelTrack.id);
  assert.equal((await asPerson(efua, () => removeComment(desk, owners.id))).changes, 0);
  assert.equal((await asPerson(label, () => removeComment({ id: label, actor_id: label, role: "owner" }, mine.id))).changes, 1);
  // An outsider pretending to be the label's owner removes nothing.
  assert.equal((await asPerson(kofi, () => removeComment({ id: label, actor_id: kofi, role: "owner" }, owners.id))).changes, 0);
  assert.equal((await comments(labelTrack.id)).length, 1);

  // The shared shortlist: on, then off.
  assert.equal(await asPerson(efua, () => toggleShortlist(efua, t!)), true);
  assert.equal(await asPerson(efua, () => toggleShortlist(efua, t!)), false);

  // The single move as moveTrack runs it: the update and its activity line in one transaction, as the person.
  const move = (actor: number, deskId: number, to: number, tr: { id: number; sender_id: number }) =>
    asPerson(actor, () =>
      q.tx(async (db) => {
        const r = await db.run("UPDATE tracks SET collection_id = ? WHERE id = ? AND user_id = ?", to, tr.id, deskId);
        await logEvent({ user_id: deskId, actor_id: actor, sender_id: tr.sender_id, track_id: tr.id, type: "moved", detail: "to Friday" }, db);
        return r.changes;
      }),
    );
  assert.equal(await move(efua, label, await collection(label), labelTrack), 1);
  const kofiBox = await collection(kofi);
  await assert.rejects(move(efua, kofi, kofiBox, kofiTrack), /row-level security/);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM tracks WHERE collection_id = ?", kofiBox), 0);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM events WHERE user_id = ?", kofi), 0);
});

test("the single move and the team actions run through the person scope", () => {
  // Server actions need a signed-in request, so this checks the code path.
  const read = (p: string) => fs.readFileSync(new URL(`../src/app/dashboard/actions/${p}`, import.meta.url), "utf8");
  const review = read("review.ts");
  const move = review.slice(review.indexOf("export async function moveTrack"), review.indexOf("export async function deleteTrack"));
  assert.match(move, /asPerson\(u\.actor_id, \(\) => ownCollection/);
  assert.match(move, /asPerson\(u\.actor_id, \(\) =>\s+q\.tx/);
  assert.doesNotMatch(move, /await q\.run/, "a change outside the person scope");
  assert.match(move, /logEvent\(\{.*\}, db\)/, "the activity line joins the move's transaction");
  const team = read("team.ts");
  for (const call of ["reviewTrack(u, trackId)", "addComment(u.actor_id, t, body)", "removeComment(u, Number(commentId))", "toggleShortlist(u.actor_id, t)"]) {
    assert.ok(team.includes(`asPerson(u.actor_id, () => ${call})`), call);
  }
});
