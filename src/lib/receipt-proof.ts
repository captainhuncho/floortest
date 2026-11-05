import "server-only";
import { cookies } from "next/headers";
import { currentPerson } from "./auth";
import { env } from "./env";
import { receiptByToken, receiptLifeByToken } from "./receipt";
import { stemStartedWhileOpen } from "./stems";
import { RECEIPT_COOKIE, RECEIPT_REMEMBER_MS, proves, withSender } from "./receipt-proof-core";

/** What a proof check needs from a receipt: its sender, that sender's current email, and the account they sent from. */
export type ProofSubject = { sender_id: number; sender_email: string; sender_account: number | null };

/**
 * Whether this request comes from the receipt's sender (src/lib/receipt-proof-core.ts): the signed-in account they
 * sent from, or this browser's signed ft_receipt cookie naming that sender with their current email. Checked on the
 * server for the page and for every receipt action; hiding a button is never the guard.
 */
export async function receiptProven(r: ProofSubject) {
  const [jar, person] = await Promise.all([cookies(), currentPerson()]);
  return proves(env.secret, r, { cookie: jar.get(RECEIPT_COOKIE)?.value, personId: person?.id ?? null });
}

/** The cookie options: http-only, Secure on the live site, Lax, the whole site, 30 days. */
export const RECEIPT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.appUrl.startsWith("https"),
  sameSite: "lax" as const,
  path: "/",
  maxAge: RECEIPT_REMEMBER_MS / 1000,
};

/** The ft_receipt value with this sender added, from the cookie the browser sent. */
export const rememberedValue = (current: string | undefined, sender: { id: number; email: string }) => withSender(env.secret, current, sender.id, sender.email);

/** Remembers this sender in this browser for 30 days (after a code, from a server action). */
export async function rememberSender(sender: { id: number; email: string }) {
  const jar = await cookies();
  jar.set(RECEIPT_COOKIE, rememberedValue(jar.get(RECEIPT_COOKIE)?.value, sender), RECEIPT_COOKIE_OPTIONS);
}

/** What an unknown receipt link and a request without proof both get, so the answer never says which. */
export const NOT_AVAILABLE = "This track is no longer available.";

/**
 * True when the receipt behind this token exists, hasn't closed, and this request proves its sender. Its life is read
 * first, so a closed and an unknown token stop at the same point after the same single lookup (Safety, 4 Nov).
 *
 * `finishing`: the stem upload being completed. A stem started while the receipt was open finishes even if it has
 * closed since (owner, 4 Nov), so a closed receipt with that upload goes on to the proof check like an open one.
 */
export async function senderProvenFor(token: string, finishing?: { stemUpload: string }) {
  const life = await receiptLifeByToken(token);
  // A closed and an unknown token take the same steps: the upload lookup runs for both when completing a stem.
  const gone = !life || life.life === "closed";
  const started = gone && !!finishing && (await stemStartedWhileOpen(token, finishing.stemUpload));
  if (!life || (gone && !started)) return false;
  const r = await receiptByToken(token);
  return !!r && (await receiptProven(r));
}
