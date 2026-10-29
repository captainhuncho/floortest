import "server-only";
import { NextRequest } from "next/server";
import { isProd } from "./env";
import { readSessionToken } from "./sessions";
import { GATE_COOKIE, gatePassword, hasGatePass } from "./site-gate";

/**
 * While the coming-soon gate is on, public API routes keyed by a receiver's handle (QR code, cover) must not confirm
 * which handles exist. The proxy never gates /api/* (webhooks, health and cron stay reachable), so those routes ask
 * here: true means "answer as for an unknown handle". A visitor with the gate pass, or a signed-in person, sees them.
 */
export async function hiddenBehindGate(req: Request): Promise<boolean> {
  if (!gatePassword()) return false;
  const jar = new NextRequest(req.url, { headers: req.headers }).cookies;
  if (hasGatePass(jar.get(GATE_COOKIE)?.value)) return false;
  // No session cookie at all: nobody is signed in, so skip the session lookup (and loading the sign-in code).
  if (!readSessionToken(jar, isProd)) return true;
  const { currentPerson } = await import("./auth");
  return !(await currentPerson());
}
