"use server";

import { revalidatePath } from "next/cache";
import { stopSharingByReceipt } from "@/lib/share-links";

/** The artist stops private sharing of this track (it leaves every collection share link at once). */
export async function stopSharing(token: string) {
  const ok = await stopSharingByReceipt(token);
  revalidatePath(`/receipt/${token}`);
  return ok;
}
