import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DELETE_PHRASE, deletePhraseOk } from "../src/lib/delete-phrase";

const read = (path: string) => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("only DELETE FLOORTEST, typed exactly, confirms a deletion", () => {
  assert.equal(DELETE_PHRASE, "DELETE FLOORTEST");
  assert.equal(deletePhraseOk("DELETE FLOORTEST"), true);
  assert.equal(deletePhraseOk("  DELETE FLOORTEST  "), true, "spaces around it are ignored");
  for (const wrong of ["delete floortest", "Delete FloorTest", "DELETE  FLOORTEST", "DELETE", "DELETE FLOORTEST!", "", "maxwell"]) {
    assert.equal(deletePhraseOk(wrong), false, `refuses ${JSON.stringify(wrong)}`);
  }
  for (const notText of [null, undefined, 1, {}]) assert.equal(deletePhraseOk(notText), false);
});

test("deleteAccount refuses on the server without the phrase, before the two-step check", () => {
  const src = read("app/dashboard/actions/settings.ts");
  const body = src.slice(src.indexOf("export async function deleteAccount("), src.indexOf("\nexport async function ", src.indexOf("export async function deleteAccount(") + 1));
  const check = body.indexOf('deletePhraseOk(form.get("confirm"))');
  assert.ok(check > 0, "checks the confirm field");
  assert.ok(check < body.indexOf("codeStepUp("), "before the two-step check");
  assert.doesNotMatch(body, /form\.get\("password"\)/, "no password to delete (owner, 18 Nov)");
  assert.ok(check < body.indexOf("requestDeletion("), "before anything is deleted");
  assert.match(body, /Type \$\{DELETE_PHRASE\} to confirm\. Nothing has been deleted\./);
});

test("both delete dialogs send the phrase and keep the red button off until it matches", () => {
  for (const file of ["app/dashboard/settings/(index)/SettingsMenu.tsx", "app/dashboard/settings/DeleteAccount.tsx"]) {
    const src = read(file);
    assert.match(src, /name="confirm" placeholder=\{DELETE_PHRASE\} value=\{typed\}/, `${file}: sent as confirm, phrase as a grey hint, not filled in`);
    const form = file.includes("SettingsMenu") ? src.slice(src.indexOf("function DeleteForGood(")) : src; // the sign-out sheet keeps its password
    assert.doesNotMatch(form, /name="password"/, `${file}: no password field (owner, 18 Nov)`);
    assert.match(src, /disabled=\{pending \|\| !deletePhraseOk\(typed\)\}/, `${file}: button off until it matches`);
    assert.match(src, /text-\[16px\]!/, `${file}: 16px on phones, no iOS zoom`);
    assert.match(src, /autoCorrect="off"/, `${file}: no autocorrect`);
    assert.doesNotMatch(src, /toLowerCase\(\) !== handle/, `${file}: no longer the link name`);
  }
});

test("codeStepUp asks only for the two-step code, under the same hourly limit", () => {
  const src = read("lib/step-up.ts");
  const fn = src.slice(src.indexOf("export async function codeStepUp("), src.indexOf("\nexport ", src.indexOf("export async function codeStepUp(") + 1));
  assert.match(fn, /allow\("step_up", String\(userId\), 10, 3_600_000\)/, "same rate limit as stepUp");
  assert.match(fn, /checkSecondFactor\(userId, code\.trim\(\)\)/, "the code when two-step is on");
  assert.doesNotMatch(fn, /verifyPassword/, "no password");
});
