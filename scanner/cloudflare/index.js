import { Container, getContainer } from "@cloudflare/containers";
import { refusal } from "./routes.js";

/**
 * FloorTest's virus scanner on Cloudflare Containers. The container is ../Dockerfile unchanged (ClamAV + server.mjs);
 * this Worker lets only a few routes through. Settings are Worker secrets (SCAN_SECRET, S3_ENDPOINT, S3_BUCKET,
 * SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY) handed to the container at start.
 *
 * The container sleeps after 10 minutes without a request (owner, 26 Oct: running all the time cost about $6.50 a
 * month in memory alone). Memory and disk are billed only while it runs. Waking takes about 15–30 seconds: the app holds
 * uploads finished while it sleeps and wakes it once per batch (/wake, within a daily budget: src/lib/scan-budget.ts),
 * and its check waits through a wake-up (src/lib/scan.ts).
 *
 *   GET  /status  the container's state, without waking it (uptime monitor, the app's health report)
 *   GET  /health  ClamAV answers; wakes the container and waits for it (the daily uptime check); needs the secret
 *   POST /wake    starts the container and returns at once; needs the secret, so nobody else can keep it running
 *   POST /scan    waits for the container to be ready (up to 90 s), then scans; needs the secret
 *
 * Which routes need the secret: ./routes.js.
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
    const refused = refusal(route, request, env);
    if (refused) return refused;
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
