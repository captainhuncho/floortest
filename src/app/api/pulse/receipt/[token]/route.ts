import { receiptPulse } from "@/lib/pulse";
import { allow, ipFrom } from "@/lib/ratelimit";

/** A sender's receipt: changes when the track is listened to, downloaded, replied to or played out. Reveals no decisions. */
export async function GET(req: Request, ctx: RouteContext<"/api/pulse/receipt/[token]">) {
  // Public and polled by the receipt page: a connection gets 60 checks a minute, far above what one open page asks for.
  if (!(await allow("receipt_pulse", ipFrom(req.headers), 60, 60_000)))
    return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  const token = (await ctx.params).token.slice(0, 64);
  return Response.json({ v: await receiptPulse(token) }, { headers: { "Cache-Control": "no-store" } });
}
