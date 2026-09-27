"use server";

import { q } from "@/lib/db";
import { allow, requestIp } from "@/lib/ratelimit";

export type WaitlistState = { ok?: boolean; error?: string } | undefined;

/** Public "request an invite". Quiet about duplicates so it can't be used to probe who's on the list. */
export async function joinWaitlist(_: WaitlistState, form: FormData): Promise<WaitlistState> {
  if (String(form.get("website") || "")) return { ok: true }; // bots fill the hidden field
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  if (!(await allow("waitlist_ip", await requestIp(), 5, 3_600_000))) return { error: "Too many requests. Try again later." };
  const str = (k: string, max: number) => String(form.get(k) || "").trim().slice(0, max);
  await q.run(
    "INSERT INTO waitlist (email, name, role, link, note, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT (email) DO NOTHING",
    email,
    str("name", 100),
    str("role", 40),
    str("link", 200),
    str("note", 500),
    Date.now(),
  );
  return { ok: true };
}
