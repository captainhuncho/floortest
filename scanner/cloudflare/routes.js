/**
 * Which requests the scanner Worker lets through. Its address is in the public repository, so every route that wakes the
 * container (billed while it runs) needs the secret; only GET /status is open, because it reads the stored state and
 * never wakes it (owner, 28 Oct: before, anyone could keep it awake by calling /health). Tested in
 * tests/scanner-worker.test.ts.
 */
const OPEN = "GET /status";
const WITH_SECRET = new Set(["GET /health", "POST /wake", "POST /scan"]);

/** Same-length comparison without an early exit, so the answer time doesn't hint at the secret. */
function authorized(request, env) {
  const given = new TextEncoder().encode(request.headers.get("Authorization") ?? "");
  const wanted = new TextEncoder().encode(`Bearer ${env.SCAN_SECRET ?? ""}`);
  if (!env.SCAN_SECRET || given.length !== wanted.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given[i] ^ wanted[i];
  return diff === 0;
}

/** The answer to refuse this request with, or null to let it through. */
export function refusal(route, request, env) {
  if (route === OPEN) return null;
  if (!WITH_SECRET.has(route)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!authorized(request, env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
