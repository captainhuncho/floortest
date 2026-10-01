"use server";

import { revalidatePath } from "next/cache";
import { answerShareRequest } from "@/lib/share";

/** The artist answers a share request from their private receipt link (the link itself is the key). */
export async function answerShare(token: string, requestId: number, allow: boolean) {
  const ok = await answerShareRequest(token, requestId, allow);
  revalidatePath(`/t/${token}`);
  return ok;
}
