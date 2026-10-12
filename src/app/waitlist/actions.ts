"use server";

import { q } from "@/lib/db";
import { isProtectedHandle } from "@/lib/identity";
import { RESERVED_HANDLES } from "@/lib/plans";
import { allow, requestIp } from "@/lib/ratelimit";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";

export type WaitlistState = { ok?: boolean; error?: string } | undefined;

/** Public "request an invite". Quiet about duplicates so it can't be used to probe who's on the list. */
export async function joinWaitlist(_: WaitlistState, form: FormData): Promise<WaitlistState> {
  if (String(form.get("website") || "")) return { ok: true }; // bots fill the hidden field
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  if (!(await allow("waitlist_ip", await requestIp(), 5, 3_600_000))) return { error: "Too many requests. Try again later." };
  if (!(await passedTurnstile(form.get("cf-turnstile-response"), await requestIp(), "waitlist"))) return { error: BOT_MESSAGE };
  const str = (k: string, max: number) => String(form.get(k) || "").trim().slice(0, max);
  await q.run(
    "INSERT INTO waitlist (email, name, role, link, note, handle, source, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (email) DO NOTHING",
    email,
    str("name", 100),
    str("role", 40),
    str("link", 200),
    str("note", 500),
    cleanHandle(str("handle", 40)),
    str("source", 200),
    Date.now(),
  );
  return { ok: true };
}

const cleanHandle = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30);

/**
 * "Is this link name free?" for the home-page claim box. Only ever answers free/taken, and protected
 * names read as taken, so it can't be used to map the protected list. Rate-limited per network.
 */
export async function checkHandle(raw: string): Promise<"free" | "taken" | "invalid" | "slow"> {
  const h = cleanHandle(String(raw || ""));
  if (!/^[a-z0-9][a-z0-9-_]{1,29}$/.test(h)) return "invalid";
  if (!(await allow("handle_check", await requestIp(), 60, 3_600_000))) return "slow";
  if (RESERVED_HANDLES.has(h) || (await isProtectedHandle(h))) return "taken";
  return (await q.get("SELECT 1 FROM users WHERE handle = ?", h)) ? "taken" : "free";
}
