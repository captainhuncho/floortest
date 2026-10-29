import assert from "node:assert/strict";
import { test } from "node:test";
import {
  base32Decode,
  base32Encode,
  hashRecovery,
  newRecoveryCodes,
  openSecret,
  sealSecret,
  totpCode,
  verifyTotp,
} from "../src/lib/totp";

// Recovery codes are keyed with the app secret (read when a code is hashed).
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

// RFC 6238 appendix B, SHA-1 key "12345678901234567890".
const RFC = base32Encode(Buffer.from("12345678901234567890"));

test("matches the RFC 6238 test vectors", () => {
  assert.equal(totpCode(RFC, Math.floor(59 / 30), 8), "94287082");
  assert.equal(totpCode(RFC, Math.floor(1111111109 / 30), 8), "07081804");
  assert.equal(totpCode(RFC, Math.floor(2000000000 / 30), 8), "69279037");
});

test("base32 round-trips", () => {
  const b = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(base32Decode(base32Encode(b)), b);
});

test("accepts current and adjacent codes, refuses replays", () => {
  const ms = 1_790_000_000_000;
  const step = Math.floor(ms / 30000);
  const code = totpCode(RFC, step);
  assert.equal(verifyTotp(RFC, code, null, ms), step);
  assert.equal(verifyTotp(RFC, code, step, ms), null, "same step again is a replay");
  assert.equal(verifyTotp(RFC, totpCode(RFC, step - 1), null, ms), step - 1);
  assert.equal(verifyTotp(RFC, totpCode(RFC, step - 3), null, ms), null, "too old");
  assert.equal(verifyTotp(RFC, "12345", null, ms), null);
});

test("sealed secrets only open with the same app secret", () => {
  const sealed = sealSecret("JBSWY3DPEHPK3PXP", "a".repeat(40));
  assert.equal(openSecret(sealed, "a".repeat(40)), "JBSWY3DPEHPK3PXP");
  assert.throws(() => openSecret(sealed, "b".repeat(40)));
});

test("recovery codes are unique and hash the same however they're typed", () => {
  const codes = newRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.equal(hashRecovery(codes[0], "k"), hashRecovery(` ${codes[0].toUpperCase().replace("-", "")} `, "k"));
});
