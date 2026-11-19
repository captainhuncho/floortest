import { receiptPulse } from "@/lib/pulse";
import { ipFrom } from "@/lib/ratelimit";
import { memoryLimit } from "@/lib/memory-limit";

/**
 * Polled by the receipt page every 8 s (faster only on a wake-up). The caps live in memory, so a refused request
 * touches no database and an allowed one writes nothing (19 Nov; before, every check wrote a `rate_events` row):
 * per receipt link a burst of 3, then one check every 8 s; per connection 60 a minute, as before.
 */
const perLink = memoryLimit(3, 8_000);
const perConnection = memoryLimit(60, 1_000);

const tooMany = (seconds: number) =>
  new Response("Too many requests", { status: 429, headers: { "Retry-After": String(seconds), "Cache-Control": "no-store" } });

/** A sender's receipt: changes when the track is listened to, downloaded, replied to or played out. Reveals no decisions. */
export async function GET(req: Request, ctx: RouteContext<"/api/pulse/receipt/[token]">) {
  const ip = ipFrom(req.headers);
  if (!perConnection.take(ip)) return tooMany(perConnection.retryAfter(ip));
  const token = (await ctx.params).token.slice(0, 64);
  if (!perLink.take(token)) return tooMany(perLink.retryAfter(token));
  return Response.json({ v: await receiptPulse(token) }, { headers: { "Cache-Control": "no-store" } });
}
