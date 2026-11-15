import { appUser } from "@/lib/app-auth";
import { body, fail, json, unauthorized } from "@/lib/api-v1";
import { env } from "@/lib/env";
import { afterResponse } from "@/lib/mail";
import { allow } from "@/lib/ratelimit";
import { currentTermsOrNull, latestAcceptance, recordAcceptance } from "@/lib/terms-record";
import { termsPdfMail } from "@/lib/terms-mail";

export const runtime = "nodejs";

const UNREADABLE = "The Terms can't be loaded right now. Try again in a minute.";

/**
 * The Terms for the app (owner, 15 Nov: nobody gets in without agreeing). Every other app route answers 403
 * { termsNeeded: true } until the person has ticked the current Terms; the app then shows them from here.
 * `needed` is false once they have; `url` is the full text to show; `hash` goes back with the tick.
 */
export async function GET(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const terms = await currentTermsOrNull();
  if (!terms) return fail(UNREADABLE, 503);
  const last = await latestAcceptance({ userId: u.id });
  return json({ needed: !last || last.hash !== terms.hash, changed: !!last && last.hash !== terms.hash, version: terms.version, hash: terms.hash, url: `${env.appUrl}/terms` });
}

/** The tick: { tick: true, hash } for the Terms the app showed. Emails the stamped copy, as the website does. */
export async function POST(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  if (!(await allow("app_terms", String(u.id), 30, 3_600_000))) return fail("Too many tries. Try again shortly.", 429);
  const data = await body(req);
  if (data.tick !== true) return fail("Tick the box to accept the Terms.", 400);
  const terms = await currentTermsOrNull();
  if (!terms) return fail(UNREADABLE, 503);
  if (data.hash !== terms.hash) return fail("The Terms changed while they were open. Read them again, then tick.", 409, { termsNeeded: true, hash: terms.hash, version: terms.version });
  const saved = await recordAcceptance({ userId: u.id, email: u.email }, u.name, terms).catch((e) => {
    console.error("[terms] couldn't record the tick", e);
    return null;
  });
  if (!saved) return fail("The Terms couldn't be saved just now. Try again in a minute.", 503);
  const { row, added } = saved;
  if (added) afterResponse(() => termsPdfMail({ userId: u.id, email: u.email, name: u.name, acceptanceId: row.id }), "[terms] copy failed; the queue will retry");
  return json({ ok: true, version: terms.version });
}
