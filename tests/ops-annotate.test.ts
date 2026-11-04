import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-ops-annotate-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.ADMIN_EMAILS = "boss@x.io";
delete process.env.DATABASE_URL;

// Tags and notes follow the suspend rank rule (Safety, 4 Nov): Care can't tag or note the super admin or other staff;
// only the super admin tags or notes staff; ordinary accounts as before.
test("who may tag or note whom", async () => {
  const { annotateRefusal } = await import("../src/lib/ops-access");
  const { PERMS } = await import("../src/lib/ops-perms");
  const sup = { id: 1, access: { super: true as const, role: "super" as const, perms: new Set(Object.keys(PERMS)) } as never };
  const care = { id: 2, access: { super: false as const, role: "care", perms: new Set(["users.support"]) } as never };
  const customer = { id: 9, super: false, staff: false };
  const boss = { id: 1, super: true, staff: false };
  const otherCare = { id: 3, super: false, staff: true };
  assert.match(annotateRefusal(care, boss)!, /super admin/, "care can't touch the super admin");
  assert.match(annotateRefusal(care, otherCare)!, /Only the super admin/, "care can't touch another staff member");
  assert.equal(annotateRefusal(sup, otherCare), null, "the super admin can");
  assert.equal(annotateRefusal(sup, boss), null, "the super admin their own account");
  assert.match(annotateRefusal(sup, { ...boss, id: 7 })!, /own account/, "but not another super admin's");
  assert.equal(annotateRefusal(care, customer), null, "an ordinary account as before");
});

test("staff are found in one query: the super admin by email, active ops members, nobody else", async () => {
  const { q } = await import("../src/lib/db");
  const { staffOf } = await import("../src/lib/ops-access");
  const t = Date.now();
  const user = async (email: string) => (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', 'N', ?, 'free', 'UTC', ?) RETURNING id", email, email.split("@")[0], t))!.id;
  const boss = await user("boss@x.io");
  const care = await user("care@x.io");
  const gone = await user("gone@x.io");
  const customer = await user("customer@x.io");
  await q.run("INSERT INTO ops_members (user_id, role, invited_by, created_at) VALUES (?, 'care', ?, ?)", care, boss, t);
  await q.run("INSERT INTO ops_members (user_id, role, invited_by, created_at, disabled_at) VALUES (?, 'care', ?, ?, ?)", gone, boss, t, t);
  const s = await staffOf([boss, care, gone, customer]);
  assert.deepEqual(s.get(boss), { super: true, staff: false });
  assert.deepEqual(s.get(care), { super: false, staff: true });
  assert.deepEqual(s.get(gone), { super: false, staff: false }, "a disabled member is an ordinary account again");
  assert.deepEqual(s.get(customer), { super: false, staff: false });
});

test("tagAccounts, saveTags and addNote check the rank rule before they write, and the bulk one counts what it skipped", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/app/admin/actions.ts"), "utf8");
  const body = (name: string) => src.slice(src.indexOf(`export async function ${name}(`), src.indexOf("\nexport ", src.indexOf(`export async function ${name}(`) + 10));
  for (const [name, write] of [["saveTags", "UPDATE users SET admin_tags"], ["addNote", "INSERT INTO account_notes"], ["tagAccounts", "UPDATE users SET admin_tags"]] as const) {
    const b = body(name);
    assert.ok(b.includes("annotateRefusal(") && b.indexOf("annotateRefusal(") < b.indexOf(write), `${name} checks before writing`);
  }
  assert.match(body("tagAccounts"), /skipped \$\{skipped\} \(ops staff\)/);
});
