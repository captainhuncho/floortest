/**
 * Which requests the scanner Worker lets through. Its address is in the public repository, so every route that wakes the
 * container (billed while it runs) needs the secret; only GET /status is open, because it reads the stored state and
 * never wakes it (owner, 28 Oct: before, anyone could keep it awake by calling /health). Tested in
 * tests/scanner-worker.test.ts.
 */
const OPEN = "GET /status";
const WITH_SECRET = new Set(["GET /health", "POST /wake", "POST /scan"]);

const sha256 = async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

/**
 * Compares SHA-256 digests of the two values: always 32 bytes and with no early exit, so the answer time hints at
 * neither the secret nor its length.
 */
async function authorized(request, env) {
  if (!env.SCAN_SECRET) return false;
  const [given, wanted] = await Promise.all([sha256(request.headers.get("Authorization") ?? ""), sha256(`Bearer ${env.SCAN_SECRET}`)]);
  let diff = 0;
  for (let i = 0; i < wanted.length; i++) diff |= given[i] ^ wanted[i];
  return diff === 0;
}

/** The answer to refuse this request with, or null to let it through. */
export async function refusal(route, request, env) {
  if (route === OPEN) return null;
  if (!WITH_SECRET.has(route)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!(await authorized(request, env))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}
