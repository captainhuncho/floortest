import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-feedback-ask-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// The one-time ask (1 Nov): after the 5th decision, once, and never again once answered.
test("the feedback ask is due from the 5th decision and only until it has been answered", async () => {
  const { FEEDBACK_ASK_AFTER, shouldAskFeedback } = await import("../src/lib/feedback-ask");
  assert.equal(FEEDBACK_ASK_AFTER, 5);
  assert.equal(shouldAskFeedback({ decisions: 0, askedAt: null }), false);
  assert.equal(shouldAskFeedback({ decisions: 4, askedAt: null }), false, "not before the 5th decision");
  assert.equal(shouldAskFeedback({ decisions: 5, askedAt: null }), true, "on the 5th");
  assert.equal(shouldAskFeedback({ decisions: 40, askedAt: undefined }), true, "still due later if never answered");
  assert.equal(shouldAskFeedback({ decisions: 5, askedAt: 1 }), false, "answered: never again");
  assert.equal(shouldAskFeedback({ decisions: 500, askedAt: Date.now() }), false);
});

// Counted per person across the account (a teammate's decisions on a team desk are theirs), and recorded on their row.
test("the ask counts the person's own decisions, and answering it on any desk ends it for them", async () => {
  const { q } = await import("../src/lib/db");
  const { feedbackAskDue, markFeedbackAsked } = await import("../src/lib/feedback");
  const t = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?) RETURNING id",
      `${handle}@fa.io`, handle, handle, t,
    ))!.id;
  const label = await user("falabel");
  const ama = await user("faama");
  const sender = async (desk: number) =>
    (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@fa.io', 'S', ?) RETURNING id", desk, t))!.id;
  const senders = new Map([[label, await sender(label)], [ama, await sender(ama)]]);
  // As logEvent stores it: on your own desk there's no actor; on a team desk, you are the actor.
  const decide = (desk: number, actor: number, type: string) =>
    q.run("INSERT INTO events (user_id, actor_id, sender_id, type, detail, created_at) VALUES (?,?,?,?,'',?)", desk, actor === desk ? null : actor, senders.get(desk), type, t);

  // Ama decides 4 on the label's team desk: not yet. Other activity doesn't count.
  for (let i = 0; i < 4; i++) await decide(label, ama, i % 2 ? "kept" : "passed");
  await decide(label, ama, "reply");
  assert.equal(await feedbackAskDue(ama), false);
  // Her 5th, on her own desk: due for her, not for the label owner whose desk most of them were on.
  await decide(ama, ama, "kept");
  assert.equal(await feedbackAskDue(ama), true);
  assert.equal(await feedbackAskDue(label), false);
  // The label owner's own decisions on their own desk (logged with no actor) count for them.
  for (let i = 0; i < 4; i++) await decide(label, label, "kept");
  assert.equal(await feedbackAskDue(label), false);
  await decide(label, label, "passed");
  assert.equal(await feedbackAskDue(label), true);

  await markFeedbackAsked(ama);
  assert.equal(await feedbackAskDue(ama), false);
  const first = await q.get<{ at: number }>("SELECT feedback_asked_at AS at FROM users WHERE id = ?", ama);
  await markFeedbackAsked(ama);
  const again = await q.get<{ at: number }>("SELECT feedback_asked_at AS at FROM users WHERE id = ?", ama);
  assert.equal(Number(again!.at), Number(first!.at), "the first answer's time is kept");
});
