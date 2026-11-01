import { requireAdminQuiet } from "@/lib/admin";
import { proofResponse } from "@/lib/verification-proposals";

export const runtime = "nodejs";

/**
 * One verification proof file (owner, 1 Nov), for staff with "verification" only. Without it, or for a file that
 * isn't there, the answer is the same 404. Headers and checks: src/lib/verification-proposals.ts proofResponse.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/verification-proofs/[id]">) {
  const admin = await requireAdminQuiet("verification");
  return proofResponse(admin?.access ?? null, (await ctx.params).id);
}
