import { receiptPulse } from "@/lib/pulse";

/** A sender's receipt: changes when the track is listened to, downloaded, replied to or played out. Reveals no decisions. */
export async function GET(_req: Request, ctx: RouteContext<"/api/pulse/receipt/[token]">) {
  const token = (await ctx.params).token.slice(0, 64);
  return Response.json({ v: await receiptPulse(token) }, { headers: { "Cache-Control": "no-store" } });
}
