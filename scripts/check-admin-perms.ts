/**
 * Build check: every ops page, admin action and admin API route must say what permission it needs, and say the one
 * in src/lib/ops-perms.ts. Fails the build (exit 1) on any gap, so a new page or action can't ship unchecked.
 * Run: tsx scripts/check-admin-perms.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ACTION_NEEDS, needFor } from "../src/lib/ops-perms";

const root = join(__dirname, "..");
const problems: string[] = [];
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// 1. Actions: each export names exactly what ACTION_NEEDS says.
const actionsFile = join(root, "src/app/admin/actions.ts");
const actions = readFileSync(actionsFile, "utf8").split(/^(?=export async function )/m);
for (const part of actions) {
  const name = part.match(/^export async function (\w+)/)?.[1];
  if (!name) continue;
  const need = ACTION_NEEDS[name];
  if (!need) problems.push(`actions.ts: ${name} has no entry in ACTION_NEEDS`);
  else if (!part.includes(`requireAdminAction("${need}")`)) problems.push(`actions.ts: ${name} must call requireAdminAction("${need}")`);
}
for (const name of Object.keys(ACTION_NEEDS)) if (!actions.some((p) => p.startsWith(`export async function ${name}(`))) problems.push(`ACTION_NEEDS: ${name} isn't an action any more`);

// 2. Pages: each calls requireAdmin with its route's requirement (the no-access page needs only a sign-in).
for (const file of walk(join(root, "src/app/admin")).filter((f) => f.endsWith(`${sep}page.tsx`))) {
  const route = "/" + relative(join(root, "src/app"), file).split(sep).slice(0, -1).filter((s) => !s.startsWith("[")).join("/");
  const src = readFileSync(file, "utf8");
  if (route === "/admin/no-access") {
    if (!src.includes("requireAdmin()")) problems.push(`${route}: must call requireAdmin()`);
    continue;
  }
  const need = needFor(route);
  if (!src.includes(`requireAdmin("${need}")`)) problems.push(`${route}: must call requireAdmin("${need}")`);
}

// 3. Admin API routes: each checks a named permission. Whole-site exports (every account's people or files) are super only.
const SUPER_ROUTES = ["users-csv", "storage-manifest"];
for (const file of walk(join(root, "src/app/api/admin")).filter((f) => f.endsWith("route.ts"))) {
  const src = readFileSync(file, "utf8");
  if (!/requireAdmin(Action)?\("[\w.]+"\)/.test(src)) problems.push(`${relative(root, file)}: must call requireAdmin("…") or requireAdminAction("…")`);
  const name = relative(join(root, "src/app/api/admin"), file).split(sep)[0];
  if (SUPER_ROUTES.includes(name) && !src.includes('requireAdminAction("super")')) problems.push(`${relative(root, file)}: must call requireAdminAction("super")`);
}

if (problems.length) {
  console.error(`Ops permission check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("Ops permission check: every page, action and admin route names its permission.");
