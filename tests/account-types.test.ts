import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-account-types-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("seven types; each switches its own tools on by default and never locks the others", async () => {
  const { ACCOUNT_TYPES, hasTool, isAccountType, toolOverrides } = await import("../src/lib/account-types");
  assert.deepEqual(Object.keys(ACCOUNT_TYPES), ["dj", "producer_dj", "ar", "label_radio", "artist", "curator", "music_pro"]);
  assert.equal(isAccountType("curator"), true);
  assert.equal(isAccountType("producer"), false, "the old ids are gone");
  assert.equal(isAccountType("toString"), false);

  // Defaults by type.
  for (const kind of ["dj", "producer_dj", "curator"] as const) assert.equal(hasTool({ kind }, "played_out"), true, kind);
  for (const kind of ["ar", "label_radio", "artist", "music_pro"] as const) assert.equal(hasTool({ kind }, "played_out"), false, kind);
  assert.equal(hasTool({ kind: null }, "played_out"), false);

  // Anyone can switch a tool on or off; only choices that differ from the type's default are stored.
  assert.equal(hasTool({ kind: "label_radio", tools: '{"played_out":true}' }, "played_out"), true);
  assert.equal(hasTool({ kind: "dj", tools: '{"played_out":false}' }, "played_out"), false);
  assert.equal(hasTool({ kind: "dj", tools: "not json" }, "played_out"), true, "an unreadable value falls back to the default");
  assert.equal(toolOverrides("dj", { played_out: true }), null);
  assert.equal(toolOverrides("dj", { played_out: false }), '{"played_out":false}');
  assert.equal(toolOverrides("ar", { played_out: true }), '{"played_out":true}');
});

test("existing accounts move to the nearest new type, and the database refuses unknown types", async () => {
  const { q } = await import("../src/lib/db");
  const add = (handle: string, kind: string | null) =>
    q.run("INSERT INTO users (email, password_hash, name, handle, plan, kind, created_at) VALUES (?, 'h', ?, ?, 'free', ?, 1)", `${handle}@x.io`, handle, handle, kind);
  // Every migration has run by now; replay the type move on rows written with the old ids, as the migration did.
  await q.run("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kind_check");
  await add("olddj", "dj");
  await add("oldproducer", "producer");
  await add("oldlabel", "label");
  await add("unset", null);
  const migration = (await import("../src/lib/db/migrations")).MIGRATIONS.find((m) => m.id === "0095_account_types")!;
  for (const stmt of migration.sql.split(";").map((s) => s.trim()).filter((s) => s && !s.includes("add column"))) await q.run(stmt);
  const kinds = Object.fromEntries((await q.all<{ handle: string; kind: string | null }>("SELECT handle, kind FROM users")).map((r) => [r.handle, r.kind]));
  assert.deepEqual(kinds, { olddj: "dj", oldproducer: "producer_dj", oldlabel: "label_radio", unset: null });
  await assert.rejects(add("bad", "producer"));
  await add("pro", "music_pro");
  const pro = await q.get<{ kind_note: string; tools: string | null }>("SELECT kind_note, tools FROM users WHERE handle = 'pro'");
  assert.deepEqual({ ...pro }, { kind_note: "", tools: null });
});
