import { refreshAppSession } from "@/lib/app-auth";
import { body, json, unauthorized } from "@/lib/api-v1";

export const runtime = "nodejs";

/** { refreshToken } → new { accessToken, refreshToken, expiresIn }. The old refresh token stops working. */
export async function POST(req: Request) {
  const t = await refreshAppSession(String((await body(req)).refreshToken ?? ""));
  return t ? json(t) : unauthorized();
}
