import { Container, getContainer } from "@cloudflare/containers";

/**
 * FloorTest's virus scanner on Cloudflare Containers. The container is ../Dockerfile unchanged (ClamAV + server.mjs);
 * this Worker lets only a few routes through. Settings are Worker secrets (SCAN_SECRET, S3_ENDPOINT, S3_BUCKET,
 * SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY) handed to the container at start.
 *
 * The container sleeps after 10 minutes without a request (owner, 26 Oct: running all the time cost about $6.50 a
 * month in memory alone). Memory and disk are billed only while it runs. Waking takes about 15–30 seconds, so the app
 * wakes it as an upload starts (/wake) and its check waits through a wake-up (src/lib/scan.ts).
 *
 *   GET  /status  the container's state, without waking it (uptime monitor, the app's health report)
 *   GET  /health  ClamAV answers; wakes the container and waits for it (the daily uptime check)
 *   POST /wake    starts the container and returns at once; needs the secret, so nobody else can keep it running
 *   POST /scan    waits for the container to be ready (up to 90 s), then scans; needs the secret
 */
export class Scanner extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";

  constructor(ctx, env) {
    super(ctx, env);
    const { SCAN_SECRET, S3_ENDPOINT, S3_BUCKET, SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY } = env;
    this.envVars = { SCAN_SECRET, S3_ENDPOINT, S3_BUCKET, SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY, PORT: "8080" };
  }
}

const scanner = (env) => getContainer(env.SCANNER);

/** Port 8080 opens only once ClamAV has loaded its signatures (../start.sh), so "port ready" means "can scan". */
const READY = { cancellationOptions: { portReadyTimeoutMS: 90_000 } };

/** Same-length comparison without an early exit, so the answer time doesn't hint at the secret. */
function authorized(request, env) {
  const given = new TextEncoder().encode(request.headers.get("Authorization") ?? "");
  const wanted = new TextEncoder().encode(`Bearer ${env.SCAN_SECRET ?? ""}`);
  if (!env.SCAN_SECRET || given.length !== wanted.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given[i] ^ wanted[i];
  return diff === 0;
}

const starting = () => Response.json({ error: "Scanner starting" }, { status: 503, headers: { "Retry-After": "10" } });

const worker = {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const route = `${request.method} ${pathname}`;
    if (route === "GET /status") {
      // Reads the container's stored state only: no request reaches the container, so it stays asleep.
      const state = await scanner(env).getState().catch(() => null);
      return Response.json({ worker: true, container: state?.status ?? "unknown" });
    }
    if (route !== "GET /health" && route !== "POST /wake" && route !== "POST /scan") return Response.json({ error: "Not found" }, { status: 404 });
    if (route !== "GET /health" && !authorized(request, env)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (route === "POST /wake") {
      ctx.waitUntil(scanner(env).startAndWaitForPorts(READY).catch(() => {}));
      return Response.json({ waking: true }, { status: 202 });
    }
    try {
      await scanner(env).startAndWaitForPorts(READY);
      return await scanner(env).fetch(request);
    } catch {
      // Still starting after 90 s, or restarting: the app treats this as "waking", waits and asks again.
      return starting();
    }
  },
};

export default worker;
