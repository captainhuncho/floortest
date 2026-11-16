import { appUserAgreed } from "@/lib/app-auth";
import { json, unauthorized } from "@/lib/api-v1";
import { capacity } from "@/lib/desk";

export const runtime = "nodejs";

/** Who's signed in, their link, plan and how full their desk is. */
export async function GET(req: Request) {
  const u = await appUserAgreed(req);
  if (u instanceof Response) return u;
  if (!u) return unauthorized();
  const cap = await capacity(u);
  return json({ id: u.id, name: u.name, firstName: u.first_name, email: u.email, handle: u.handle, plan: u.plan, used: cap.used, limit: cap.limit, full: cap.full });
}
