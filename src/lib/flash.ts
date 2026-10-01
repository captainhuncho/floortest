import "server-only";
import { cookies } from "next/headers";

export const FLASH_COOKIE = "ft_flash";
export type Flash = { id: number; text: string; tone: "ok" | "error" };

/** A one-time message shown after an admin action ("Suspended @x", "Nothing changed: …"). */
export async function flash(text: string, tone: Flash["tone"] = "ok") {
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ id: Date.now(), text: text.slice(0, 200), tone })), {
    path: "/admin",
    maxAge: 30,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const f = JSON.parse(decodeURIComponent(raw));
    return typeof f?.text === "string" ? { id: Number(f.id) || 0, text: f.text, tone: f.tone === "error" ? "error" : "ok" } : null;
  } catch {
    return null;
  }
}
