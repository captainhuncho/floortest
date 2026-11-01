import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-person-batch-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: batch Keep, Not for me and clear run as the signed-in person", async () => {
  const { q, asPerson } = await import("../src/lib/db");
  const { clearDecisions, decideMany } = await import("../src/lib/review");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?) RETURNING id",
      `${handle}@batch.io`, handle, handle, now, now,
    ))!.id;
  const tracks = async (desk: number, n: number) => {
    const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", desk, `s${desk}@send.io`, now))!.id;
    const out: { id: number; decision: null }[] = [];
    for (let i = 0; i < n; i++)
      out.push({
        ...(await q.get<{ id: number }>(
          "INSERT INTO tracks (user_id, sender_id, token, title, artist, original_name, mime, size, created_at) VALUES (?, ?, ?, 'T', 'A', 't.wav', 'audio/wav', 1, ?) RETURNING id",
          desk, sender, `tok-${desk}-${i}-${Math.random()}`, now,
        ))!,
        decision: null,
      });
    return out;
  };
  const desk = (id: number, actor = id) => ({ id, actor_id: actor, role: "owner" }) as never;
  const kept = (desk: number) => q.count("SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ? AND decision = 'kept'", desk);
  const logged = (desk: number) => q.count("SELECT COUNT(*)::int AS n FROM events WHERE user_id = ?", desk);

  const ama = await user("ama");
  const kofi = await user("kofi");
  const amaTracks = await tracks(ama, 3);
  const kofiTracks = await tracks(kofi, 2);

  // Own desk: the batch and its log entries go through under the rules.
  assert.deepEqual(await asPerson(ama, () => decideMany(desk(ama), amaTracks, "kept")), { changed: 3, locked: 0 });
  assert.equal(await kept(ama), 3);
  assert.equal(await logged(ama), 3);
  const nowKept = amaTracks.map((t) => ({ ...t, decision: "kept" as const }));
  assert.deepEqual(await asPerson(ama, () => clearDecisions(desk(ama), nowKept)), { changed: 3, locked: 0 });
  assert.equal(await kept(ama), 0);

  // Someone else's tracks, even with the desk check fooled: the database shows none, so none change.
  assert.equal((await asPerson(ama, () => decideMany(desk(kofi, ama), kofiTracks, "kept"))).changed, 0);
  assert.equal(await kept(kofi), 0);
  assert.equal(await logged(kofi), 0);
  await q.run("UPDATE tracks SET decision = 'kept' WHERE user_id = ?", kofi);
  const kofiKept = kofiTracks.map((t) => ({ ...t, decision: "kept" as const }));
  assert.equal((await asPerson(ama, () => clearDecisions(desk(kofi, ama), kofiKept))).changed, 0);
  assert.equal(await kept(kofi), 2);
});
