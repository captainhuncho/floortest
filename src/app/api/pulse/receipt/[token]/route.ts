import { receiptPulse } from "@/lib/pulse";
import { ipFrom } from "@/lib/ratelimit";
import { memoryLimit } from "@/lib/memory-limit";

/**
 * Polled by the receipt page every 8 s (faster only on a wake-up). The caps live in memory, so a refused request
 * touches no database and an allowed one writes nothing (19 Nov; before, every check wrote a `rate_events` row):
 * per receipt link and connection a burst of 5, then one check every 4 s (twice the page's pace, so a wake-up or a
 * second tab fits; counted per connection so the same receipt open on a phone and a laptop never crowd each other out);
 * per connection 60 a minute across links, as before.
 */
const perLink = memoryLimit(5, 4_000);
const perConnection = memoryLimit(60, 1_000);

const tooMany = (seconds: number) =>
  new Response("Too many requests", { status: 429, headers: { "Retry-After": String(seconds), "Cache-Control": "no-store" } });

/** A sender's receipt: changes when the track is listened to, downloaded, replied to or played out. Reveals no decisions. */
export async function GET(req: Request, ctx: RouteContext<"/api/pulse/receipt/[token]">) {
  const ip = ipFrom(req.headers);
  if (!perConnection.take(ip)) return tooMany(perConnection.retryAfter(ip));
  const token = (await ctx.params).token.slice(0, 64);
  const linkKey = `${ip} ${token}`;
  if (!perLink.take(linkKey)) return tooMany(perLink.retryAfter(linkKey));
  return Response.json({ v: await receiptPulse(token) }, { headers: { "Cache-Control": "no-store" } });
}
