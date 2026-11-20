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
  // Report is an item in the review card's More menu (option 1; owner, 20 Nov), given to every role.
  assert.match(panel, /report=\{\{ action: reportTrack\.bind\(null, t\.id\), senderName: sender\.name, canBlock: !!desk && atLeast\(desk\.role, "admin"\) && !sender\.blocked_at \}\}/);
  // Delete is the only item behind the members-can't-delete guard.
  assert.match(panel, /onDelete=\{desk\?\.role !== "member" \? deleteTrack\.bind\(null, t\.id, next\?\.href \?\? "\/dashboard\/review"\) : undefined\}/);
  const menu = fs.readFileSync(new URL("../src/app/dashboard/review/MoreMenu.tsx", import.meta.url), "utf8");
  assert.match(menu, /\.\.\.\(report \? \[\{ label: "Report"/);
  assert.match(menu, /\.\.\.\(onDelete \? \[\{ label: "Delete"/);
  // Nothing on the card itself moves, reports or deletes: the old fold and its buttons are gone.
  assert.doesNotMatch(panel, /<ReportTrack|<ConfirmButton|data-panel-details/);
});

test("the review card's More menu ends with Report, then Delete in red under one divider, and has no Details", () => {
  const menu = fs.readFileSync(new URL("../src/app/dashboard/review/MoreMenu.tsx", import.meta.url), "utf8");
  const order = ["Move to callout…", "Move to a project…", "Copy link", '"Report"', '"Delete"'].map((label) => menu.indexOf(`label: ${label.startsWith('"') ? label : `"${label}"`}`));
  assert.ok(order.every((at) => at > 0), "every item is in the menu");
  assert.deepEqual(order, order.toSorted((a, b) => a - b));
  assert.match(menu, /label: "Delete", icon: "x" as const, run: \(\) => setPanel\("delete"\), danger: true/);
  assert.doesNotMatch(menu, /label: "Details"|label: "Move",/);
  // Move to a project is offered only when the card passes the control, which it does for the desk's own uploads.
  assert.match(panel, /project=\{ownUpload \? <MoveToProjects /);
});
