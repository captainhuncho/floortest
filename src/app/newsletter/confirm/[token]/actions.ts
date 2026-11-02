"use server";

import { confirmSubscription } from "@/lib/newsletter";

/** The newsletter's confirm button (a POST): only pressing it confirms the sign-up. */
export async function confirmNewsletter(token: string) {
  return confirmSubscription(String(token).slice(0, 64));
}
