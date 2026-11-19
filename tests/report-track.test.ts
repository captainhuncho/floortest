import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Server actions need a signed-in request, so these check the code path of the desk's Report button (App Review 1.2).
const src = fs.readFileSync(new URL("../src/app/dashboard/actions/report.ts", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../src/app/dashboard/ReviewPanel.tsx", import.meta.url), "utf8");

test("a report needs a track on this desk, a known reason and a rate limit before anything is saved", () => {
  const body = src.slice(src.indexOf("export async function reportTrack"));
  const owned = body.indexOf("await ownedTrack(u, trackId)");
  const limited = body.indexOf('allow("report_track"');
  const reason = body.indexOf("isReason(reason)");
  const saved = body.indexOf("INSERT INTO contact_messages");
  assert.ok(owned > 0 && limited > owned && reason > limited && saved > reason, "checks run in order, before the insert");
  // The reason picks the topic from a fixed list; the request never names the topic itself.
  assert.match(body, /const topic = REASONS\[reason\]/);
  assert.doesNotMatch(body, /form\.get\("topic"\)/);
  // The note is capped.
  assert.match(body, /\.slice\(0, 2000\)/);
});

test("blocking in the same step is for admins and owners only", () => {
  assert.match(src, /form\.get\("block"\) === "on" && !!sender && !sender\.blocked_at && atLeast\(u\.role, "admin"\)/);
  assert.match(src, /await ownedSender\(u, t\.sender_id\)/);
});

test("every role on the desk sees Report; the block box only shows to admins and owners", () => {
  assert.match(panel, /<ReportTrack action=\{reportTrack\.bind\(null, t\.id\)\}/);
  assert.match(panel, /canBlock=\{!!desk && atLeast\(desk\.role, "admin"\) && !sender\.blocked_at\}/);
  // Report sits outside the members-can't-delete guard.
  const report = panel.indexOf("<ReportTrack");
  const guard = panel.indexOf('{desk?.role !== "member" && (', report);
  assert.ok(report > 0 && guard > report);
});
