// Aggressive local check: concurrency, hostile input, rate limits and auth on every public surface.
// Usage: npx tsx scripts/stress.ts <base-url> <receiver-handle>   (local or a throwaway deployment, never live)
// Any 5xx is a failure: bad input must be refused politely, never crash the server.

const [base = "http://localhost:3000", handle = "invitee"] = process.argv.slice(2);
let failed = 0;
const results: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail).slice(0, 200)}`}`);
  if (!ok) failed++;
};
const ip = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip(), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

async function main() {
  // 1. Concurrency: 200 requests across public pages at once.
  const pages = ["/", `/${handle}`, "/sitemap.xml", "/robots.txt", "/api/health", "/login", "/signup", "/terms", "/privacy", "/contact"];
  const t0 = Date.now();
  const burst = await Promise.all(Array.from({ length: 200 }, (_, i) => fetch(`${base}${pages[i % pages.length]}`).then((r) => r.status).catch(() => 0)));
  const bad = burst.filter((s) => s === 0 || s >= 500);
  check(`200 concurrent page loads, none fail (${Date.now() - t0} ms)`, bad.length === 0, { bad: bad.length, sample: bad.slice(0, 5) });

  // 2. Hostile submissions: every one must be a clean 4xx.
  const S = `/api/submit/${handle}`;
  // A valid start request; each hostile case breaks exactly one thing about it.
  const ok = () => ({ name: "Stress", email: `s${Math.random().toString(36).slice(2)}@example.com`, title: "Stress", genre: "Afro House", fileName: "a.wav", size: 1000 });
  const hostile: [string, () => Promise<Response>][] = [
    ["not JSON", () => post(S, "{{{not json")],
    ["empty body", () => post(S, {})],
    ["wrong types", () => post(S, { ...ok(), name: 42, email: ["x"], title: { a: 1 }, fileName: null, size: "big" })],
    ["negative size", () => post(S, { ...ok(), size: -5 })],
    ["10 GB file", () => post(S, { ...ok(), size: 10e9 })],
    ["path traversal name", () => post(S, { ...ok(), fileName: "../../etc/passwd.wav" })],
    ["exe disguised by name", () => post(S, { ...ok(), fileName: "virus.exe" })],
    ["invalid email", () => post(S, { ...ok(), email: "not-an-email" })],
    ["1 MB title", () => post(S, { ...ok(), title: "x".repeat(1_000_000) })],
    ["SQL injection", () => post(S, { ...ok(), name: "'; DROP TABLE users; --", title: "' OR 1=1 --" })],
    ["unknown receiver", () => post("/api/submit/no-such-person-xyz", ok())],
    ["complete with fake upload id", () => post(`${S}/complete`, { uploadId: "00000000-fake", duration: 5 })],
    ["complete with garbage", () => post(`${S}/complete`, "garbage")],
  ];
  for (const [name, go] of hostile) {
    const r = await go().catch(() => null);
    const mayPass = ["SQL injection", "1 MB title", "path traversal name"].includes(name); // stored safely as text / trimmed / renamed
    check(`hostile submit: ${name} → ${mayPass ? "handled" : "refused"} cleanly (${r?.status})`, !!r && r.status < 500 && (r.status >= 400 || mayPass));
  }

  const still = await fetch(`${base}/${handle}`);
  check(`receiver page still works after the injection attempts (${still.status})`, still.ok);

  // 3. Rate limit: the same connection hammering the intake must be cut off, not crash.
  const fixed = "198.51.100.77";
  const flood = await Promise.all(
    Array.from({ length: 30 }, () =>
      post(S, ok(), { "X-Forwarded-For": fixed }).then((r) => r.status),
    ),
  );
  check(`rate limit trips under a 30-request flood (${[...new Set(flood)].join(",")})`, flood.includes(429) && !flood.some((s) => s >= 500));

  // 4. Private things without signing in: never 200 with data, never 5xx.
  const privatePaths = ["/api/tracks/1/audio", "/api/tracks/1/download", "/api/export?files=1", "/api/admin/data?email=a@b.co", "/dashboard", "/admin", "/api/tracks/1/stems/zip"];
  for (const p of privatePaths) {
    const r = await fetch(`${base}${p}`, { redirect: "manual" });
    check(`signed out: ${p} → blocked (${r.status})`, [301, 302, 303, 307, 308, 401, 403, 404].includes(r.status));
  }
  const cron = await fetch(`${base}/api/cron/digest`, { headers: { Authorization: "Bearer wrong" } });
  check(`cron with a wrong secret (${cron.status})`, cron.status < 500);

  // 5. Token pages with junk: must be a calm "not found", not a crash.
  for (const p of ["/t/junk", "/s/junk", "/v/junk", "/sent/junk", "/unsubscribe/junk.junk", "/confirm-email/junk", "/verify-email/junk", "/reset/junk", "/t/" + "a".repeat(5000)]) {
    const r = await fetch(`${base}${p}`);
    check(`junk token ${p.slice(0, 30)} (${r.status})`, r.status < 500);
  }
  const unsub = await fetch(`${base}/api/unsubscribe/forged.token`, { method: "POST" });
  check(`forged unsubscribe refused (${unsub.status})`, unsub.status === 404);

  // 6. Server-action and method abuse.
  const wrongMethod = await fetch(`${base}/api/submit/${handle}`, { method: "DELETE" });
  check(`wrong HTTP method (${wrongMethod.status})`, wrongMethod.status === 405 || (wrongMethod.status >= 400 && wrongMethod.status < 500));

  console.log(results.join("\n"));
  console.log(failed ? `\n${failed} check(s) FAILED` : `\nAll ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main();

export {};
