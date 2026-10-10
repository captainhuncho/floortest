import { appUser } from "@/lib/app-auth";
import { fail, json, unauthorized } from "@/lib/api-v1";
import { allow } from "@/lib/ratelimit";
import { receiverLookup } from "@/lib/receiver-lookup";

export const runtime = "nodejs";

/** Who is floortest.app/<handle>, and are they taking music? The same answer the Send page shows as you type. */
export async function GET(req: Request, ctx: RouteContext<"/api/v1/receivers/[handle]">) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  if (!(await allow("app_lookup", String(u.id), 300, 3_600_000))) return fail("Too many lookups. Try again shortly.", 429);
  return json(await receiverLookup(u, (await ctx.params).handle));
}
