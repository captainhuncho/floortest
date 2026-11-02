import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// The toast's "Sending in 5 s · Undo" for held ops sends (src/app/admin/kit/core.ts heldLeft). mail.ts is loaded only
// for its hold, with a throwaway database and secret.
process.env.DATA_DIR = testDataDir("ft-held-countdown-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("the toast counts 5 s down while the server holds the email 8 s", async () => {
  const { heldLeft, heldSeconds, HELD_MARGIN_MS, HELD_SERVER_MS, HELD_SHOWN_MS } = await import("../src/app/admin/kit/core");
  const { SEND_HOLD_MS } = await import("../src/lib/mail");
  assert.equal(HELD_SERVER_MS, SEND_HOLD_MS, "the toast knows the server's hold");
  assert.equal(HELD_SHOWN_MS, 5_000);
  assert.ok(HELD_SHOWN_MS + HELD_MARGIN_MS < SEND_HOLD_MS, "the window shown closes well before the email goes");

  const at = 1_000_000;
  assert.equal(heldSeconds(heldLeft(at, at)), 5, "starts at 5 s");
  assert.equal(heldSeconds(heldLeft(at, at + 100)), 5);
  assert.equal(heldSeconds(heldLeft(at, at + 1_000)), 4);
  assert.equal(heldSeconds(heldLeft(at, at + 4_100)), 1, "1 s in the last second");
  assert.equal(heldLeft(at, at + 5_000), 0, "no Undo once 5 s have passed");
  assert.equal(heldLeft(at, at + 60_000), 0, "nor any time later");
  assert.equal(heldLeft(at, at - 500), HELD_SHOWN_MS, "a clock step back never shows more than 5 s");
});

test("a pause stops the count but never keeps Undo past the server's hold", async () => {
  const { heldLeft, heldSeconds, HELD_MARGIN_MS, HELD_SERVER_MS } = await import("../src/app/admin/kit/core");
  const at = 1_000_000;
  // Hovered for 1 s: the count is 1 s behind, so at 5 s there is a second left.
  assert.equal(heldSeconds(heldLeft(at, at + 5_000, 1_000)), 1);
  // Hovered for a minute: Undo still closes HELD_MARGIN_MS before the email goes.
  const lastChance = at + HELD_SERVER_MS - HELD_MARGIN_MS;
  assert.ok(heldLeft(at, lastChance - 1, 60_000) > 0);
  assert.equal(heldLeft(at, lastChance, 60_000), 0, "expired at the server's hold, less the margin");
  assert.equal(heldLeft(at, at + HELD_SERVER_MS, 60_000), 0, "no Undo once the server has sent it");
  // Under a long pause the count keeps going down to that hard stop, so it never shows more time than there is.
  assert.equal(heldSeconds(heldLeft(at, at + 4_000, 60_000)), 3);
  assert.equal(heldLeft(at, at + 1_000, -5_000), 4_000, "a negative pause counts as none");
});
