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
  if (!/requireAdmin(Action|Quiet)?\("[\w.]+"\)/.test(src)) problems.push(`${relative(root, file)}: must call requireAdmin("…"), requireAdminAction("…") or requireAdminQuiet("…")`);
  const name = relative(join(root, "src/app/api/admin"), file).split(sep)[0];
  if (SUPER_ROUTES.includes(name) && !src.includes('requireAdminAction("super")')) problems.push(`${relative(root, file)}: must call requireAdminAction("super")`);
}

// 4. Ops folders (Users CRM, moderation queue, ops kit): no server actions of their own (they live in actions.ts, so
// check 1 covers them), every action they import has an ACTION_NEEDS entry, and no client file pulls in a server-only
// module. Type-only imports are skipped: they vanish at build.
const OPS_DIRS = ["src/app/admin/accounts/crm", "src/app/admin/moderation/queue", "src/app/admin/kit"];
const adminActions = join(root, "src/app/admin/actions");
const resolveImport = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/") ? join(root, "src", spec.slice(2)) : spec.startsWith(".") ? join(from, "..", spec) : null;
  if (!base) return null;
  for (const p of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(p).isFile()) return p;
    } catch {}
  }
  return null;
};
const valueImports = (src: string) =>
  [...src.matchAll(/^import\s+(?!type\s)([^"';]*?)\s+from\s+["']([^"']+)["']/gm)]
    .map(([, names, spec]) => ({
      spec,
      names: (names.match(/\{([^}]*)\}/)?.[1] ?? "")
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n && !n.startsWith("type "))
        .map((n) => n.split(/\s+as\s+/)[0]),
      hasDefault: /^[\w$]+/.test(names.trim()),
    }))
    .filter((i) => i.names.length || i.hasDefault);
for (const dir of OPS_DIRS) {
  for (const file of walk(join(root, dir)).filter((f) => /\.tsx?$/.test(f))) {
    const rel = relative(root, file);
    const src = readFileSync(file, "utf8");
    if (/^\s*["']use server["']/m.test(src)) problems.push(`${rel}: server actions belong in src/app/admin/actions.ts`);
    const isClient = /^["']use client["']/.test(src.trimStart());
    for (const imp of valueImports(src)) {
      const target = resolveImport(file, imp.spec);
      if (!target) continue;
      if (target.replace(/\.tsx?$/, "") === adminActions)
        for (const n of imp.names) if (!ACTION_NEEDS[n]) problems.push(`${rel}: imports ${n} from actions.ts, which has no entry in ACTION_NEEDS`);
      if (isClient && /^import\s+["']server-only["']/m.test(readFileSync(target, "utf8")))
        problems.push(`${rel}: client file imports server-only ${imp.spec}`);
    }
  }
}
// The CRM and queue loaders read every account or track: outside their own folders, only a page that signs in an
// admin may import them (the folder's own components call them under that page). Known limits: a re-export
// (export { … } from) is not followed, and tests/ is not scanned.
const LOADERS = ["src/app/admin/accounts/crm/data.ts", "src/app/admin/moderation/queue/data.ts"].map((f) => join(root, f));
for (const file of walk(join(root, "src")).filter((f) => /\.tsx?$/.test(f) && !LOADERS.some((l) => f.startsWith(join(l, "..") + sep)))) {
  const src = readFileSync(file, "utf8");
  if (!valueImports(src).some((imp) => LOADERS.includes(resolveImport(file, imp.spec) ?? ""))) continue;
  const rel = relative(root, file);
  if (!file.endsWith(`${sep}page.tsx`) || !/requireAdmin(Quiet)?\("[\w.]+"\)/.test(src))
    problems.push(`${rel}: imports a CRM or queue loader; only a page.tsx that calls requireAdmin("…") or requireAdminQuiet("…") may`);
}

if (problems.length) {
  console.error(`Ops permission check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("Ops permission check: every page, action and admin route names its permission.");
