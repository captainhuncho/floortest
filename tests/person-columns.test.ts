import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-person-columns-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("per-person rules: a teammate's sign-in secrets can't be read or changed as ft_person", async () => {
  const { q, asPerson, USER_COLUMNS } = await import("../src/lib/db");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, totp_secret, recovery_codes, google_sub, created_at) VALUES (?, 'hash', ?, ?, 'free', 'UTC', ?, 'secret', 'codes', ?, ?) RETURNING id",
      `${handle}@columns.io`, handle, handle, now, `sub-${handle}`, now,
    ))!.id;
  const label = await user("label");
  const efua = await user("efua"); // on the label's team
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", label, efua, now);

  // The columns the app reads about a person still work, for a teammate's row too.
  const row = await asPerson(efua, () => q.get<{ id: number; email: string }>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, label));
  assert.equal(row?.email, "label@columns.io");

  // Secret columns are refused outright, for a teammate and for the person's own row.
  for (const col of ["password_hash", "totp_secret", "recovery_codes", "google_sub", "email_verify_token", "pending_email_token"]) {
    await assert.rejects(asPerson(efua, () => q.get(`SELECT ${col} FROM users WHERE id = ?`, label)), /permission denied/, col);
    await assert.rejects(asPerson(efua, () => q.get(`SELECT ${col} FROM users WHERE id = ?`, efua)), /permission denied/, col);
  }
  await assert.rejects(asPerson(efua, () => q.all("SELECT * FROM users")), /permission denied/);
  await assert.rejects(asPerson(efua, () => q.run("UPDATE users SET password_hash = 'x' WHERE id = ?", efua)), /permission denied/);
  await assert.rejects(asPerson(efua, () => q.run("UPDATE users SET plan = 'team' WHERE id = ?", efua)), /permission denied/);
  assert.equal((await q.get<{ h: string }>("SELECT password_hash AS h FROM users WHERE id = ?", efua))!.h, "hash");
});
