import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and test-only secrets, set before the app's modules load. Nothing leaves the machine.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-ops-hardening-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("test-webhook-secret-0123456789").toString("base64")}`;
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("backups name the key that sealed them; after a key change the old key still opens them", async () => {
  const { sealBackup, openBackup, backupSecrets, keyId } = await import("../src/lib/backup-crypto");
  const oldKey = "old-key-".padEnd(48, "o");
  const newKey = "new-key-".padEnd(48, "n");
  const data = Buffer.from("gzipped json stands in here");
  const made = sealBackup(data, oldKey);
  assert.deepEqual(made.subarray(4, 12), keyId(oldKey), "the key's short name is in the file");
  assert.throws(() => openBackup(made, [newKey]), new RegExp(keyId(oldKey).toString("hex")), "missing key: says which one");
  const ring = backupSecrets({ BACKUP_KEY: newKey, BACKUP_OLD_KEYS: ` ${oldKey} ` } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual(openBackup(made, ring), data, "found in BACKUP_OLD_KEYS");
  assert.deepEqual(openBackup(sealBackup(data, newKey), ring), data);
  // A version-1 backup (no key name) still opens with whichever key fits.
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(`floortest-backup:${oldKey}`).digest(), iv);
  const body = Buffer.concat([c.update(data), c.final()]);
  const v1 = Buffer.concat([Buffer.from("FTB1"), iv, c.getAuthTag(), body]);
  assert.deepEqual(openBackup(v1, ring), data);
});

test("a delivery report is acted on once: a replayed webhook changes nothing and raises no second incident", async () => {
  const { q } = await import("../src/lib/db");
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  await q.run("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at, provider_id) VALUES (NULL, 'bounce@x.io', 'S', 'B', 'sent', 'sender', ?, 'em_1')", Date.now());
  const secret = Buffer.from(process.env.RESEND_WEBHOOK_SECRET!.replace(/^whsec_/, ""), "base64");
  const send = (id: string) => {
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: "em_1", to: ["bounce@x.io"], bounce: { type: "Permanent", message: "no such user" } } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("base64");
    return POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` } }));
  };
  const incidents = async () => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM incidents"))!.n;
  assert.deepEqual(await (await send("msg_1")).json(), { ok: true });
  assert.equal((await q.get<{ delivery: string }>("SELECT delivery FROM outbox WHERE provider_id = 'em_1'"))!.delivery, "bounced");
  assert.ok(await q.get("SELECT 1 FROM email_suppressions WHERE email = 'bounce@x.io'"));
  const after = await incidents();
  assert.deepEqual(await (await send("msg_1")).json(), { duplicate: true }, "the same event again");
  assert.equal(await incidents(), after, "no second incident");
});

test("a scheduled job never runs twice at once; a crashed run frees its lease after LEASE_MS", async () => {
  const { withJobLease, LEASE_MS } = await import("../src/lib/cron");
  const t = Date.now();
  let inner: unknown = "not run";
  const outer = await withJobLease("purge", async () => {
    inner = await withJobLease("purge", async () => "second copy", t);
    return "first copy";
  }, t);
  assert.equal(outer, "first copy");
  assert.equal(inner, null, "the overlapping call is skipped");
  assert.equal(await withJobLease("purge", async () => "next night", t + 1000), "next night", "freed when the run ends");

  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO app_state (key, value, updated_at) VALUES ('lease_digest', 'crashed', ?)", t);
  assert.equal(await withJobLease("digest", async () => "ran", t + 1000), null, "a crashed run still holds it for a while");
  assert.equal(await withJobLease("digest", async () => "ran", t + LEASE_MS + 1000), "ran", "then it's free");
});
