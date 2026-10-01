import { applyUnsubscribe } from "@/lib/unsubscribe";

/** One-click unsubscribe (RFC 8058): mail apps POST here straight from the inbox. */
export async function POST(_req: Request, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const ok = await applyUnsubscribe((await ctx.params).token);
  return new Response(ok ? "Unsubscribed" : "Not found", { status: ok ? 200 : 404 });
}

/** Someone opened the header link in a browser: show the confirm page instead of acting on a GET. */
export async function GET(req: Request, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  return Response.redirect(new URL(`/unsubscribe/${encodeURIComponent((await ctx.params).token)}`, req.url), 303);
}
