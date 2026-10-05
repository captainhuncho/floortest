"use server";

import { verifySender } from "@/lib/intake";

export async function confirmEmail(token: string) {
  return !!(await verifySender(String(token)));
}
