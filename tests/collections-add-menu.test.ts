import { test } from "node:test";
import assert from "node:assert/strict";
import { addItems, tabFrom } from "../src/app/dashboard/collections/add-items";

/** Collections, option 66 (owner, 20 Nov): two tabs in ?tab=, one + Add per tab, no Record. */
const names = (o: Parameters<typeof addItems>[0]) => addItems(o).map((i) => i.name);

test("the tab comes from ?tab=; old ?kind=callouts links and no tab land on Callouts", () => {
  assert.equal(tabFrom({ tab: "projects" }), "projects");
  assert.equal(tabFrom({ tab: "callouts" }), "callouts");
  assert.equal(tabFrom({}), "callouts");
  assert.equal(tabFrom({ tab: "all" }), "callouts");
});

test("Callouts offers Callout and Folder; Projects offers Import, Project and Folder; never Record", () => {
  const owner = { inFolder: false, canEdit: true, canCreate: true };
  assert.deepEqual(names({ tab: "callouts", ...owner }), ["Callout", "Folder"]);
  assert.deepEqual(names({ tab: "projects", ...owner }), ["Import", "Project", "Folder"]);
  for (const tab of ["callouts", "projects"] as const) assert.ok(!names({ tab, ...owner }).includes("Record"));
});

test("each item has one quiet line; Folder says what it groups", () => {
  const all = [...addItems({ tab: "callouts", inFolder: false, canEdit: true, canCreate: true }), ...addItems({ tab: "projects", inFolder: false, canEdit: true, canCreate: true })];
  for (const i of all) assert.ok(i.line.length > 0, i.name);
  assert.deepEqual(all.filter((i) => i.kind === "folder").map((i) => i.line), ["Groups callouts", "Groups projects"]);
});

test("inside a folder: no Folder (no folders in folders); Import and Project in a projects folder, Callout in a callouts folder", () => {
  assert.deepEqual(names({ tab: "projects", inFolder: true, canEdit: true, canCreate: true }), ["Import", "Project"]);
  assert.deepEqual(names({ tab: "callouts", inFolder: true, canEdit: true, canCreate: true }), ["Callout"]);
  // Filing into a folder is an owner or A&R / Admin power, so a ticked Member gets no Callout inside one.
  assert.deepEqual(names({ tab: "callouts", inFolder: true, canEdit: false, canCreate: true }), []);
});

test("a ticked Member gets Callout only; an unticked Member gets nothing", () => {
  assert.deepEqual(names({ tab: "callouts", inFolder: false, canEdit: false, canCreate: true }), ["Callout"]);
  assert.deepEqual(names({ tab: "projects", inFolder: false, canEdit: false, canCreate: true }), []);
  assert.deepEqual(names({ tab: "callouts", inFolder: false, canEdit: false, canCreate: false }), []);
});
