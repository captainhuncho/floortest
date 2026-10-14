import { Container, getContainer } from "@cloudflare/containers";

/**
 * FloorTest's virus scanner on Cloudflare Containers. The container is ../Dockerfile unchanged (ClamAV + server.mjs);
 * this Worker only lets /health and /scan through and keeps one instance running. Settings are Worker secrets
 * (SCAN_SECRET, S3_ENDPOINT, S3_BUCKET, SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY) handed to the container at start.
 */
export class Scanner extends Container {
  defaultPort = 8080;
  sleepAfter = "1h";

  constructor(ctx, env) {
    super(ctx, env);
    const { SCAN_SECRET, S3_ENDPOINT, S3_BUCKET, SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY } = env;
    this.envVars = { SCAN_SECRET, S3_ENDPOINT, S3_BUCKET, SCAN_ACCESS_KEY_ID, SCAN_SECRET_ACCESS_KEY, PORT: "8080" };
  }

  // Never sleep: a cold start (container placement plus loading signatures) is longer than an upload should wait.
  async onActivityExpired() {}
}

const scanner = (env) => getContainer(env.SCANNER);

const worker = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const allowed = (request.method === "GET" && pathname === "/health") || (request.method === "POST" && pathname === "/scan");
    if (!allowed) return Response.json({ error: "Not found" }, { status: 404 });
    try {
      return await scanner(env).fetch(request);
    } catch {
      // Starting or restarting: the app treats this as "scanner unreachable", keeps the file and asks again.
      return Response.json({ error: "Scanner starting" }, { status: 503, headers: { "Retry-After": "10" } });
    }
  },

  async scheduled(_event, env, ctx) {
    // Signatures are in the image, so a start took about 12 s locally; four minutes covers a download if they are missing.
    ctx.waitUntil(scanner(env).startAndWaitForPorts({ cancellationOptions: { portReadyTimeoutMS: 240_000 } }).catch(() => {}));
  },
};

export default worker;
