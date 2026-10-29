import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-feedback-actor-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Feedback sent from a team desk is the teammate's: our reply goes to them, and the account it came from is kept.
test("feedback from a team desk records the person who sent it, not the account owner", async () => {
  const { q } = await import("../src/lib/db");
  const { fileFeedback } = await import("../src/lib/feedback");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?) RETURNING id",
      `${handle}@fb.io`, handle, handle, t,
    ))!.id;
  const label = await user("fblabel");
  const ama = await user("fbama");
  const row = () => q.get<{ user_id: number; actor_id: number | null; name: string; email: string; topic: string; page: string }>(
    "SELECT user_id, actor_id, name, email, topic, page FROM contact_messages ORDER BY id DESC LIMIT 1",
  );

  await fileFeedback({ id: label, actor_id: ama }, "Bug", "The waveform stalls", "/dashboard/floor");
  assert.deepEqual(await row(), { user_id: label, actor_id: ama, name: "fbama", email: "fbama@fb.io", topic: "Feedback · Bug", page: "/dashboard/floor" });

  await fileFeedback({ id: label, actor_id: label }, "Other", "On my own desk", "");
  assert.deepEqual(await row(), { user_id: label, actor_id: label, name: "fblabel", email: "fblabel@fb.io", topic: "Feedback", page: "" });

  await fileFeedback({ id: label, actor_id: ama }, "Idea", "   ", "/x");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM contact_messages"), 2, "an empty message is dropped");
});
