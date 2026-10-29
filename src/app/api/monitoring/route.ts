import { NextResponse } from "next/server";
import { readLimited } from "@/lib/body-limit";
import { allow, ipFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";

const MAX_BYTES = 1_000_000;

/**
 * Sentry tunnel: the browser sends crash reports here and we pass them on to Sentry, so pages only ever talk
 * to FloorTest. Only envelopes for our own Sentry project are forwarded, to Sentry's own ingest host.
 */
export async function POST(req: Request) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return new NextResponse(null, { status: 204 });
  if (!(await allow("sentry_tunnel", ipFrom(req.headers), 120, 60_000))) return new NextResponse(null, { status: 429 });
  const body = await readLimited(req, MAX_BYTES);
  if (!body) return new NextResponse(null, { status: 413 });
  try {
    const ours = new URL(dsn);
    const header = JSON.parse(body.slice(0, body.indexOf("\n"))) as { dsn?: string };
    const theirs = new URL(header.dsn ?? "");
    const project = ours.pathname.replace(/\//g, "");
    if (theirs.host !== ours.host || theirs.pathname.replace(/\//g, "") !== project) return new NextResponse(null, { status: 400 });
    const res = await fetch(`https://${ours.host}/api/${project}/envelope/`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
      signal: AbortSignal.timeout(8000),
    });
    return new NextResponse(null, { status: res.status });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
