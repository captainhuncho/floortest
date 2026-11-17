/**
 * The production dependency gate (CI and the checks before every push): `npm audit --omit=dev`, failing on any high or
 * critical finding, except advisories the owner has accepted for a limited time (ALLOW below, recorded in SECURITY.md
 * under "Accepted risks and owner steps"). A finding is let through only if every advisory it leads to is on the list and
 * not past its expiry, so a new advisory on the same package, or one reached through the same path, still fails.
 * Run: npm run audit:prod
 */
import { execFileSync } from "node:child_process";

export type Allowed = { id: string; reason: string; expires: string };

/** Accepted advisories. Each one expires: past its date it counts again and the check fails, so it has to be looked at. */
export const ALLOW: Allowed[] = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    reason:
      "picomatch <=4.0.7 ReDoS, reached only through @sentry/nextjs > @rollup/plugin-commonjs at build time; no user input reaches a glob. Owner's yes 17 Nov 2026 (SECURITY.md).",
    expires: "2026-12-17",
  },
];

type Advisory = { url?: string; source?: number; title?: string; severity?: string };
type Vuln = { severity: string; via: (string | Advisory)[] };
export type AuditJson = { vulnerabilities?: Record<string, Vuln> };

const SERIOUS = new Set(["high", "critical"]);
const advisoryId = (a: Advisory) => /GHSA-[a-z0-9-]+/i.exec(a.url ?? "")?.[0] ?? `npm-advisory-${a.source ?? "unknown"}`;

/** Every advisory a package's finding leads to, following `via` names to the packages they point at. */
function advisoriesOf(audit: AuditJson, name: string, seen = new Set<string>()): Advisory[] {
  if (seen.has(name)) return [];
  seen.add(name);
  const v = audit.vulnerabilities?.[name];
  if (!v) return [];
  return v.via.flatMap((x) => (typeof x === "string" ? advisoriesOf(audit, x, seen) : [x]));
}

/** Splits the high and critical findings into those that fail the check and those an unexpired allow-list entry covers. */
export function checkAudit(audit: AuditJson, allow: Allowed[] = ALLOW, today = new Date().toISOString().slice(0, 10)) {
  const live = new Map(allow.filter((a) => a.expires >= today).map((a) => [a.id, a]));
  const failed: { name: string; severity: string; advisories: string[] }[] = [];
  const allowed: { name: string; severity: string; advisories: string[]; reasons: string[] }[] = [];
  for (const [name, v] of Object.entries(audit.vulnerabilities ?? {})) {
    if (!SERIOUS.has(v.severity)) continue;
    const ids = [...new Set(advisoriesOf(audit, name).map(advisoryId))];
    if (ids.length && ids.every((id) => live.has(id))) allowed.push({ name, severity: v.severity, advisories: ids, reasons: ids.map((id) => `${id} until ${live.get(id)!.expires}: ${live.get(id)!.reason}`) });
    else failed.push({ name, severity: v.severity, advisories: ids });
  }
  return { failed, allowed };
}

function runAudit(): AuditJson {
  let out: string;
  try {
    out = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // npm audit exits 1 when it finds anything; the report is still on stdout.
    out = (e as { stdout?: string }).stdout ?? "";
  }
  try {
    return JSON.parse(out) as AuditJson;
  } catch {
    console.error("npm audit gave no report (offline, or the registry didn't answer). Failing rather than passing unchecked.");
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("audit-check.ts")) {
  const { failed, allowed } = checkAudit(runAudit());
  for (const a of allowed) console.log(`Allowed (${a.severity}) ${a.name}: ${a.reasons.join("; ")}`);
  for (const f of failed) console.error(`Not allowed (${f.severity}) ${f.name}: ${f.advisories.join(", ") || "no advisory named"}`);
  if (failed.length) {
    console.error(`${failed.length} high or critical finding(s) in production dependencies.`);
    process.exit(1);
  }
  console.log(`No high or critical findings in production dependencies${allowed.length ? ` beyond ${allowed.length} allowed above` : ""}.`);
}
