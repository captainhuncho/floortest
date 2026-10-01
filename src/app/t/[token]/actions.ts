"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { answerShareRequest, cancelShareConsent, CONSENT_CANCEL_MINUTES, finalizeConsent } from "@/lib/share";
import { q } from "@/lib/db";

/** The artist answers a share request from their private receipt link (the link itself is the key). */
export async function answerShare(token: string, requestId: number, allow: boolean) {
  const ok = await answerShareRequest(token, requestId, allow);
  revalidatePath(`/t/${token}`);
  if (ok && allow) {
    // When the cancel window closes, make it final and alert the receiver. The dashboard also checks, as a backstop.
    after(async () => {
      await new Promise((r) => setTimeout(r, CONSENT_CANCEL_MINUTES * 60_000 + 2_000));
      const t = await q.get<{ id: number }>("SELECT id FROM tracks WHERE token = ?", token);
      if (t) await finalizeConsent(t.id);
    });
  }
  return ok;
}

/** Within the cancel window after Allowing. */
export async function cancelShare(token: string, requestId: number) {
  const ok = await cancelShareConsent(token, requestId);
  revalidatePath(`/t/${token}`);
  return ok;
}
