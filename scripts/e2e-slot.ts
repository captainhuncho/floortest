// npm run e2e: runs Playwright only once it holds one of the Mac's e2e slots, so at most two full e2e runs go at once
// across every session and worktree (owner, 2 Nov; docs/working.md rule 5). A slot is a folder made with mkdir, which
// either succeeds or fails in one step, so two runs can never take the same slot (counting `ps` could race).
// The slots live outside every repo, in one folder all worktrees share: ~/.cache/floortest-e2e-slots/slot-1, slot-2.
// It sits in the home folder, not the shared temp folder. The folder and each slot must be real directories (not
// links) owned by this user with mode 0700, or the run stops with an error. holder.json is made with "wx" and 0600 and
// is read without following links. It holds only the pid, the worktree, the e2e port and the start time.
// A slot whose run has died (its pid is gone) is taken over. CI skips the lock (GitHub runs alone).
// Env: E2E_SLOTS changes the count (default 2); E2E_SLOT_DIR changes the folder (the unit tests use their own).
// Extra arguments go to Playwright: npm run e2e -- e2e/core-loop.spec.ts. `npx playwright test ...` takes no slot.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type SlotOptions = { dir: string; count: number };
export type Holder = { slot: string; pid: number; cwd: string; port: string | null; started: string };

const INFO = "holder.json";
const RETRY_MS = 15_000;
// A slot folder with no readable holder file is a claim caught between mkdir and the write; only after this long is
// it treated as left behind by a run that died in that moment.
const UNWRITTEN_GRACE_MS = 30_000;
const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;

export class UnsafeSlotDirError extends Error {}

export function defaultOptions(env: Record<string, string | undefined> = process.env): SlotOptions {
  const count = Number.parseInt(env.E2E_SLOTS ?? "", 10);
  return {
    dir: env.E2E_SLOT_DIR || path.join(os.homedir(), ".cache", "floortest-e2e-slots"),
    count: Number.isInteger(count) && count > 0 ? count : 2,
  };
}

function slotPaths({ dir, count }: SlotOptions): string[] {
  return Array.from({ length: count }, (_, i) => path.join(dir, `slot-${i + 1}`));
}

/** Throws unless the path is a real directory (not a link), owned by this user, with mode 0700. */
export function assertPrivateDir(dir: string): void {
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new UnsafeSlotDirError(`e2e: ${dir} is not a real directory`);
  const uid = process.getuid?.();
  if (uid !== undefined && stat.uid !== uid) throw new UnsafeSlotDirError(`e2e: ${dir} is not owned by this user`);
  const mode = stat.mode & 0o777;
  if (mode !== PRIVATE_DIR) {
    throw new UnsafeSlotDirError(`e2e: ${dir} has mode ${mode.toString(8)}, needs 700 (chmod 700 it, or remove it)`);
  }
}

function readHolder(slot: string): Holder | null {
  let fd: number | undefined;
  try {
    // O_NOFOLLOW: a holder.json that is a link is never opened.
    fd = fs.openSync(path.join(slot, INFO), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (!fs.fstatSync(fd).isFile()) return null;
    const info = JSON.parse(fs.readFileSync(fd, "utf8"));
    if (typeof info.pid !== "number") return null;
    return { slot, pid: info.pid, cwd: String(info.cwd), port: info.port ? String(info.port) : null, started: String(info.started) };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else, so it is alive.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function isStale(slot: string): boolean {
  const holder = readHolder(slot);
  if (holder) return !pidAlive(holder.pid);
  try {
    return Date.now() - fs.lstatSync(slot).mtimeMs > UNWRITTEN_GRACE_MS;
  } catch {
    return false; // Gone already: the next mkdir decides.
  }
}

/** Removes a path only if it sits directly inside the slot folder. */
function removeInside(dir: string, target: string): void {
  if (path.dirname(path.resolve(target)) !== path.resolve(dir)) throw new UnsafeSlotDirError(`e2e: refusing to remove ${target}`);
  fs.rmSync(target, { recursive: true, force: true });
}

/** Moves a dead run's slot aside (rename is one step, so only one waiter wins), then frees it. */
function reclaim(dir: string, slot: string): void {
  const aside = path.join(dir, `${path.basename(slot)}.stale-${process.pid}-${Date.now()}`);
  try {
    fs.renameSync(slot, aside);
  } catch {
    return; // Another waiter got there first.
  }
  const moved = readHolder(aside);
  if (moved && pidAlive(moved.pid)) {
    // A live run claimed it between the check and the rename: give it back.
    try {
      fs.renameSync(aside, slot);
      return;
    } catch {
      // The name is taken again; that run keeps its slot and this one is cleared below.
    }
  }
  removeInside(dir, aside);
}

function tryMkdir(slot: string): boolean {
  try {
    fs.mkdirSync(slot, { mode: PRIVATE_DIR });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

/** Takes a free (or dead run's) slot and returns its folder, or null when every slot is held by a live run. */
export function claimSlot(
  options: SlotOptions,
  pid = process.pid,
  cwd = process.cwd(),
  port: string | null = process.env.E2E_PORT || null,
): string | null {
  fs.mkdirSync(options.dir, { recursive: true, mode: PRIVATE_DIR });
  assertPrivateDir(options.dir);
  for (const slot of slotPaths(options)) {
    if (!tryMkdir(slot)) {
      if (!isStale(slot)) continue;
      reclaim(options.dir, slot);
      if (!tryMkdir(slot)) continue;
    }
    assertPrivateDir(slot);
    fs.writeFileSync(path.join(slot, INFO), JSON.stringify({ pid, cwd, port, started: new Date().toISOString() }), {
      flag: "wx",
      mode: PRIVATE_FILE,
    });
    return slot;
  }
  return null;
}

/** Frees a slot, but only if this run still holds it. */
export function releaseSlot(options: SlotOptions, slot: string, pid = process.pid): void {
  const holder = readHolder(slot);
  if (holder && holder.pid !== pid) return;
  removeInside(options.dir, slot);
}

export function holders(options: SlotOptions): Holder[] {
  return slotPaths(options).flatMap((slot) => readHolder(slot) ?? []);
}

/** Claims a slot, retrying every intervalMs while all are held. */
export async function waitForSlot(
  options: SlotOptions,
  intervalMs = RETRY_MS,
  log: (line: string) => void = console.log,
): Promise<string> {
  for (;;) {
    const slot = claimSlot(options);
    if (slot) return slot;
    const who = holders(options).map(
      (h) => `${path.basename(h.slot)}: pid ${h.pid} in ${h.cwd}${h.port ? ` on port ${h.port}` : ""} since ${h.started}`,
    );
    log(`e2e: all ${options.count} slots busy (${who.join("; ") || "starting up"}); retrying in ${Math.round(intervalMs / 1000)} s`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function runPlaywright(args: string[]): Promise<number> {
  const child = spawn("npx", ["playwright", "test", ...args], { stdio: "inherit" });
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  process.on("SIGINT", forward("SIGINT"));
  process.on("SIGTERM", forward("SIGTERM"));
  return new Promise((resolve) => {
    child.on("error", (error) => {
      console.error(`e2e: could not start Playwright: ${error.message}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (process.env.CI) {
    process.exit(await runPlaywright(args));
  }
  const options = defaultOptions();
  const slot = await waitForSlot(options);
  process.on("exit", () => releaseSlot(options, slot));
  console.log(`e2e: took ${slot} (pid ${process.pid})`);
  const code = await runPlaywright(args);
  releaseSlot(options, slot);
  console.log(`e2e: released ${slot}`);
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof UnsafeSlotDirError ? error.message : error);
    process.exit(1);
  });
}
