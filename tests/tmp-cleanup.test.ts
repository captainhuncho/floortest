import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { templateDir } from "./test-db";

// 2 Nov: every test file's ft-* database folder used to stay in the temp folder; about 45,000 of them filled the disk.
// Each check runs a small test file in its own process with its own temp folder (TMPDIR), so other sessions' runs in
// the shared temp folder can't make it pass or fail.
const root = path.resolve(import.meta.dirname, "..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "floortest-tc-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

// NODE_TEST_CONTEXT (set even when empty) would make the child think it is part of this run and skip its file.
function childEnv(tmp: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: tmp };
  delete env.NODE_TEST_CONTEXT;
  delete env.DATA_DIR;
  return env;
}

function runInOwnTmp(name: string, body: string) {
  // Short folder names: tsx puts a socket in the child's temp folder, and macOS caps socket paths at 104 bytes.
  const tmp = path.join(scratch, name);
  fs.mkdirSync(tmp);
  // The migrated template, so the child copies it instead of migrating from empty (the link isn't an ft-* folder).
  const template = templateDir();
  if (fs.existsSync(template)) fs.symlinkSync(template, path.join(tmp, path.basename(template)));
  const file = path.join(scratch, `${name}.test.ts`);
  fs.writeFileSync(
    file,
    `import { test } from "node:test";
import { testDataDir } from ${JSON.stringify(path.join(root, "tests/test-db.ts"))};
process.env.DATA_DIR = testDataDir("ft-tmp-check-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
console.log("DATA_DIR=" + process.env.DATA_DIR);
${body}
`,
  );
  const run = spawnSync(path.join(root, "node_modules/.bin/tsx"), ["--conditions=react-server", "--test", "--test-force-exit", file], {
    cwd: root,
    env: childEnv(tmp),
    encoding: "utf8",
  });
  const made = /DATA_DIR=(\S+)/.exec(run.stdout)?.[1];
  const left = fs.readdirSync(tmp).filter((n) => n.startsWith("ft-"));
  return { status: run.status, made, left, output: run.stdout + run.stderr };
}

test("a test file that opens its database leaves no ft-* folder behind", () => {
  const run = runInOwnTmp("p", `test("opens the database", async () => {
  const { q } = await import(${JSON.stringify(path.join(root, "src/lib/db"))});
  await q.get("SELECT 1");
});`);
  assert.equal(run.status, 0, run.output);
  assert.ok(run.made, `the child made its folder: ${run.output}`);
  assert.deepEqual(run.left, []);
});

test("a test file whose test fails still removes its ft-* folder", () => {
  const run = runInOwnTmp("f", `test("fails on purpose", () => { throw new Error("on purpose"); });`);
  assert.notEqual(run.status, 0, "the child's test failed");
  assert.ok(run.made, `the child made its folder: ${run.output}`);
  assert.deepEqual(run.left, []);
});

test("no test file makes its own ft-* folder outside testDataDir, which removes it", () => {
  const dir = path.join(root, "tests");
  const raw = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".ts") && n !== "test-db.ts")
    .filter((n) => /mkdtemp(Sync)?\([^)]*["'`]ft-/.test(fs.readFileSync(path.join(dir, n), "utf8")));
  assert.deepEqual(raw, [], "use testDataDir from ./test-db for an ft-* folder");
});
