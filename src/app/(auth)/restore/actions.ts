"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { RESTORE_COOKIE, restoreWithTicket } from "@/lib/account-deletion";

/**
 * "Restore my account": only with the ticket a full sign-in to the switched-off account just issued (15 minutes, used
 * once). Switches the account back on, then signs the person in normally.
 */
export async function restoreAccount(): Promise<{ error?: string } | undefined> {
  const jar = await cookies();
  const userId = await restoreWithTicket(jar.get(RESTORE_COOKIE)?.value);
  jar.delete({ name: RESTORE_COOKIE, path: "/restore" });
  if (!userId) return { error: "That took too long, or the account can no longer be restored. Sign in again." };
  await createSession(userId);
  redirect("/dashboard/floor?restored=1");
}
