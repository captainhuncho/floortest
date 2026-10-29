import { appUser, endAppSession, readAccessToken } from "@/lib/app-auth";
import { body, json, unauthorized } from "@/lib/api-v1";

export const runtime = "nodejs";

/** Signs this phone out: { refreshToken } with the Bearer access token. */
export async function POST(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const session = readAccessToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""))?.session ?? "";
  await endAppSession(String((await body(req)).refreshToken ?? ""), u.id, session);
  return json({ ok: true });
}
