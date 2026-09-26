"use server";

import { verifySender } from "@/lib/core";

export async function confirmEmail(token: string) {
  return !!(await verifySender(String(token)));
}
