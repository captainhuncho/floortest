import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { claimSlot, defaultOptions, holders, releaseSlot, waitForSlot } from "../scripts/e2e-slot";

// Each test gets its own slot folder, never the shared one other sessions use.
const made: string[] = [];
function tempOptions() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-slot-test-"));
  made.push(dir);
  return { dir, count: 2 };
}
after(() => made.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

// The pid of a process that has finished: no live process has it (until the OS reuses it, which takes far longer).
function deadPid(): number {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  return Number(child.stdout);
}

test("two runs get a slot each; a third gets none while both are alive", () => {
  const options = tempOptions();
  const first = claimSlot(options, process.pid, "/repo/a");
  const second = claimSlot(options, process.ppid, "/repo/b");
  assert.equal(path.basename(first ?? ""), "slot-1");
  assert.equal(path.basename(second ?? ""), "slot-2");
  assert.equal(claimSlot(options), null);
  assert.deepEqual(holders(options).map((h) => [h.pid, h.cwd]), [[process.pid, "/repo/a"], [process.ppid, "/repo/b"]]);
});

test("a slot held by a dead run is taken over", () => {
  const options = tempOptions();
  claimSlot(options, process.ppid, "/repo/b");
  claimSlot(options, deadPid(), "/repo/crashed");
  const slot = claimSlot(options, process.pid, "/repo/c");
  assert.equal(path.basename(slot ?? ""), "slot-2");
  assert.deepEqual(holders(options).map((h) => h.cwd), ["/repo/b", "/repo/c"]);
  assert.deepEqual(fs.readdirSync(options.dir).sort(), ["slot-1", "slot-2"]);
});

test("releasing frees the slot for the next run; a waiting run gets it", async () => {
  const options = tempOptions();
  const first = claimSlot(options);
  claimSlot(options, process.ppid);
  assert.ok(first);
  const lines: string[] = [];
  const waiting = waitForSlot(options, 20, (line) => lines.push(line));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(lines.length > 0 && lines[0].includes("slots busy"));
  releaseSlot(first);
  assert.equal(path.basename(await waiting), "slot-1");
});

test("release leaves a slot alone that another run now holds", () => {
  const options = tempOptions();
  const slot = claimSlot(options, process.ppid);
  assert.ok(slot);
  releaseSlot(slot, process.pid);
  assert.equal(holders(options).length, 1);
});

test("the slot folder is shared and outside the repo; E2E_SLOTS changes the count", () => {
  assert.equal(defaultOptions({}).dir, path.join(os.tmpdir(), "floortest-e2e-slots"));
  assert.equal(defaultOptions({}).count, 2);
  assert.equal(defaultOptions({ E2E_SLOTS: "3" }).count, 3);
  assert.equal(defaultOptions({ E2E_SLOTS: "0" }).count, 2);
});
