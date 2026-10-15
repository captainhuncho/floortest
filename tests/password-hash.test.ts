import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { hashPassword, needsRehash, verifyPassword } from "../src/lib/password-hash";

/** A hash in the pre-15-Oct format: Node's default scrypt cost, `<salt>:<hash>`. */
const legacy = (pw: string) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
};

test("new hashes use the higher cost, verify, and reject a wrong password", async () => {
  const h = await hashPassword("a long and decent password");
  assert.match(h, /^scrypt\$15\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("a long and decent password", h), true);
  assert.equal(await verifyPassword("a long and decent passworD", h), false);
  assert.equal(needsRehash(h), false);
});

test("two hashes of the same password differ (fresh salt each time)", async () => {
  assert.notEqual(await hashPassword("same password"), await hashPassword("same password"));
});

test("old-format hashes still verify and are flagged for upgrade", async () => {
  const h = legacy("my old password");
  assert.equal(await verifyPassword("my old password", h), true);
  assert.equal(await verifyPassword("not it", h), false);
  assert.equal(needsRehash(h), true);
});

test("a lower-cost scrypt$ hash is flagged; damaged or hostile rows never verify", async () => {
  const salt = crypto.randomBytes(16);
  const cheap = `scrypt$14$8$1$${salt.toString("hex")}$${crypto.scryptSync("pw", salt, 64).toString("hex")}`;
  assert.equal(await verifyPassword("pw", cheap), true);
  assert.equal(needsRehash(cheap), true);
  for (const bad of ["", "nonsense", "scrypt$30$8$1$aa$bb", "scrypt$15$8$3$$", "scrypt$x$8$1$aa$bb", "aa:bb"]) {
    assert.equal(await verifyPassword("pw", bad), false, bad);
  }
});
