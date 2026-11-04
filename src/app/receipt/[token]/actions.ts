"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { stopSharingByReceipt } from "@/lib/share-links";
import { receiptByToken, receiptLifeByToken } from "@/lib/receipt";
import { receiptPathForToken } from "@/lib/receipt-token";
import { receiptProven, rememberSender } from "@/lib/receipt-proof";
import { CodeError, checkCode, sendCode } from "@/lib/sender-code";
import { allow, ipFrom } from "@/lib/ratelimit";
import { maskEmail } from "@/lib/mask-email";
import { normalEmail } from "@/lib/email-normal";
import { hashToken } from "@/lib/token-hash";

const HOUR = 3_600_000;
/** Codes one receipt can ask for in an hour, on top of sender-code.ts's limits per email (5) and per connection (20). */
const RECEIPT_CODES_PER_HOUR = 3;

/**
 * The artist stops private sharing of this track (it leaves every collection share link at once). Only with proof of
 * being the sender (src/lib/receipt-proof.ts); without it, the same "nothing happened" as an unknown link.
 */
export async function stopSharing(token: string) {
  const r = await receiptByToken(token);
  // Read-only from the track's final outcome (src/lib/receipt-life.ts), so nothing changes from then on.
  if (!r || (await receiptLifeByToken(token))?.life !== "open" || !(await receiptProven(r))) return false;
  const ok = await stopSharingByReceipt(token);
  revalidatePath(receiptPathForToken(token));
  return ok;
}

export type CodeState = { sent?: string; error?: string; done?: boolean } | null;

/**
 * "Show my details": emails a code to the sender's address, taken from the receipt, never typed. One answer every
 * time, whatever happened (a limit, a bounce, an unknown link): "We sent a code to m•••@g•••.com".
 */
export async function requestReceiptCode(token: string): Promise<CodeState> {
  const r = await receiptByToken(token);
  // A closed receipt answers as an unknown link does.
  if (!r || (await receiptLifeByToken(token))?.life === "closed") return { sent: maskEmail(null) };
  const sent = { sent: maskEmail(r.sender_email) };
  if (!(await allow("receipt_code", hashToken(token.slice(0, 100)), RECEIPT_CODES_PER_HOUR, HOUR))) return sent;
  try {
    await sendCode(normalEmail(r.sender_email), ipFrom(await headers()), "receipt");
  } catch (e) {
    if (!(e instanceof CodeError)) console.error("[receipt:code]", e);
  }
  return sent;
}

/** Checks the code; right once, then this browser shows this sender's receipts for 30 days. */
export async function verifyReceiptCode(token: string, _: CodeState, form: FormData): Promise<CodeState> {
  const r = await receiptByToken(token);
  const code = String(form.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
  if (!r || (await receiptLifeByToken(token))?.life === "closed") return { error: "That code isn't right. Check the email and try again." };
  if (code.length !== 6) return { sent: maskEmail(r.sender_email), error: "Enter the 6-digit code from the email." };
  try {
    await checkCode(normalEmail(r.sender_email), code, { remember: false });
  } catch (e) {
    return { sent: maskEmail(r.sender_email), error: e instanceof CodeError ? e.message : "Something went wrong. Try again." };
  }
  await rememberSender({ id: r.sender_id, email: r.sender_email });
  revalidatePath(receiptPathForToken(token));
  return { done: true };
}
