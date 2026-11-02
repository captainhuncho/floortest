import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { UnsafeSlotDirError, claimSlot, defaultOptions, holders, releaseSlot, waitForSlot } from "../scripts/e2e-slot";

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

test("each slot is a private folder and holder.json carries only pid, worktree, port and start time", () => {
  const options = tempOptions();
  const slot = claimSlot(options, process.pid, "/repo/a", "3290");
  assert.ok(slot);
  assert.equal(fs.lstatSync(slot).mode & 0o777, 0o700);
  // One open file for both checks, so the mode and the contents come from the same file.
  const fd = fs.openSync(path.join(slot, "holder.json"), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    assert.equal(fs.fstatSync(fd).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(fd, "utf8"))), ["pid", "cwd", "port", "started"]);
  } finally {
    fs.closeSync(fd);
  }
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
  releaseSlot(options, first);
  assert.equal(path.basename(await waiting), "slot-1");
});

test("release leaves a slot alone that another run now holds", () => {
  const options = tempOptions();
  const slot = claimSlot(options, process.ppid);
  assert.ok(slot);
  releaseSlot(options, slot, process.pid);
  assert.equal(holders(options).length, 1);
});

test("the slot folder is shared, outside the repo and the temp folder; E2E_SLOTS changes the count", () => {
  assert.equal(defaultOptions({}).dir, path.join(os.homedir(), ".cache", "floortest-e2e-slots"));
  assert.equal(defaultOptions({ E2E_SLOT_DIR: "/x/slots" }).dir, "/x/slots");
  assert.equal(defaultOptions({}).count, 2);
  assert.equal(defaultOptions({ E2E_SLOTS: "3" }).count, 3);
  assert.equal(defaultOptions({ E2E_SLOTS: "0" }).count, 2);
});

test("a slot folder that is a link is refused", () => {
  const options = tempOptions();
  const real = path.join(options.dir, "real");
  fs.mkdirSync(real, { mode: 0o700 });
  const link = path.join(options.dir, "linked");
  fs.symlinkSync(real, link);
  assert.throws(() => claimSlot({ dir: link, count: 2 }), UnsafeSlotDirError);
  assert.deepEqual(fs.readdirSync(real), []);
});

test("a slot folder others can read or write is refused", () => {
  const options = tempOptions();
  fs.chmodSync(options.dir, 0o755);
  assert.throws(() => claimSlot(options), /needs 700/);
  assert.deepEqual(fs.readdirSync(options.dir), []);
});

test("a holder.json that is a link is not followed, and the slot stays held until the grace runs out", () => {
  const options = tempOptions();
  const target = path.join(options.dir, "elsewhere.json");
  const planted = JSON.stringify({ pid: process.pid, cwd: "/planted", started: "x" });
  fs.writeFileSync(target, planted);
  fs.mkdirSync(path.join(options.dir, "slot-1"), { mode: 0o700 });
  fs.symlinkSync(target, path.join(options.dir, "slot-1", "holder.json"));
  assert.deepEqual(holders(options), []);
  assert.equal(path.basename(claimSlot(options) ?? ""), "slot-2");
  assert.equal(fs.readFileSync(target, "utf8"), planted);
});
