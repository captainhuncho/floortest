"use server";

import { revalidatePath } from "next/cache";
import { answerShareRequest, cancelShareConsent } from "@/lib/share";

/** The artist answers a share request from their private receipt link (the link itself is the key). */
export async function answerShare(token: string, requestId: number, allow: boolean) {
  const ok = await answerShareRequest(token, requestId, allow);
  revalidatePath(`/receipt/${token}`);
  // No waiting here: the consent becomes final the first time anything looks at it after the 2-minute window
  // (the receipt, the receiver's dashboard or contacts, a share action), with the daily job as a backstop.
  return ok;
}

/** Within the cancel window after Allowing. */
export async function cancelShare(token: string, requestId: number) {
  const ok = await cancelShareConsent(token, requestId);
  revalidatePath(`/receipt/${token}`);
  return ok;
}
