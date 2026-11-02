"use server";

import { unsubscribeNewsletter } from "@/lib/newsletter";

/** The newsletter's unsubscribe button (a POST): only pressing it unsubscribes. */
export async function leaveNewsletter(token: string) {
  return unsubscribeNewsletter(String(token).slice(0, 64));
}
