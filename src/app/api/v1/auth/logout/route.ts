import { appUser, endAppSession } from "@/lib/app-auth";
import { body, json, unauthorized } from "@/lib/api-v1";

export const runtime = "nodejs";

/** Signs this phone out: { refreshToken } with the Bearer access token. */
export async function POST(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  await endAppSession(String((await body(req)).refreshToken ?? ""), u.id);
  return json({ ok: true });
}
