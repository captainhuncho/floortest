import { test } from "node:test";
import assert from "node:assert/strict";

// A throwaway secret for signing in this test only (the real one lives in Vercel). Set before the module loads.
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
const lib = () => import("../src/lib/offline");

test("an offline link names one track and one receiver, and only lasts an hour", async () => {
  const { offlineToken, readOfflineToken, OFFLINE_LINK_MS } = await lib();
  const now = 1_800_000_000_000;
  const tok = offlineToken(42, 7, now);
  assert.deepEqual(readOfflineToken(tok, now + 1000), { trackId: 42, userId: 7 });
  assert.equal(readOfflineToken(tok, now + OFFLINE_LINK_MS + 1), null);
});

test("changing the track, the receiver or the expiry in a link is refused", async () => {
  const { offlineToken, readOfflineToken } = await lib();
  const now = 1_800_000_000_000;
  const [t, u, exp, sig] = offlineToken(42, 7, now).split(".");
  assert.equal(readOfflineToken([43, u, exp, sig].join("."), now), null);
  assert.equal(readOfflineToken([t, 8, exp, sig].join("."), now), null);
  assert.equal(readOfflineToken([t, u, Number(exp) + 1e9, sig].join("."), now), null);
  assert.equal(readOfflineToken(`${t}.${u}.${exp}`, now), null);
});
