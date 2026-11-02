"use server";

import { confirmReopenAlert } from "@/lib/reopen";

/** The reopen alert's confirm button (a POST): only pressing it arms the alert. */
export async function confirmReopen(token: string) {
  return confirmReopenAlert(String(token).slice(0, 64));
}
