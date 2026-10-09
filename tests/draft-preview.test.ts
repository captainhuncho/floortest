import { test } from "node:test";
import assert from "node:assert/strict";

// A throwaway secret for signing in this test only (the real one lives in Vercel). Set before the module loads.
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
const lib = () => import("../src/lib/draft-preview");

const me = { adminId: 7, session: "a".repeat(64) };

test("a preview pass and cookie carry the exact ops session, and only their own kind", async () => {
  const { passHolder, previewCookie, previewer, previewPass } = await lib();
  assert.deepEqual(passHolder(previewPass(me)), me);
  assert.deepEqual(previewer(previewCookie(me)), me);
  assert.equal(previewer(previewPass(me)), null); // a pass can't stand in for the cookie
  assert.equal(passHolder(previewCookie(me)), null);
});

test("swapping the admin or the session in a copied cookie is refused", async () => {
  const { previewCookie, previewer } = await lib();
  const [id, session, exp, sig] = previewCookie(me).split(".");
  assert.equal(previewer([8, session, exp, sig].join(".")), null);
  assert.equal(previewer([id, "b".repeat(64), exp, sig].join(".")), null);
  assert.equal(previewer([id, session, String(Number(exp) + 1e9), sig].join(".")), null);
  assert.equal(previewer(`${id}.${exp}.${sig}`), null); // the old format, without a session
});
