import "server-only";
import { NextRequest } from "next/server";
import { isProd } from "./env";
import { readSessionToken } from "./sessions";
import { GATE_COOKIE, gateLock, hasGatePass } from "./site-gate";

/**
 * UNUSED since 10 Nov (#503): receiving links are open while the gate is on, so the QR and cover routes no longer ask
 * here and nothing imports this. Kept until the owner decides whether to delete it; don't wire it back up without
 * checking that. It used to answer "true" for "answer as for an unknown handle" to visitors without the gate pass.
 */
export async function hiddenBehindGate(req: Request): Promise<boolean> {
  const lock = await gateLock();
  if (!lock) return false;
  const jar = new NextRequest(req.url, { headers: req.headers }).cookies;
  if (await hasGatePass(jar.get(GATE_COOKIE)?.value, lock)) return false;
  // No session cookie at all: nobody is signed in, so skip the session lookup (and loading the sign-in code).
  if (!readSessionToken(jar, isProd)) return true;
  const { currentPerson } = await import("./auth");
  return !(await currentPerson());
}
