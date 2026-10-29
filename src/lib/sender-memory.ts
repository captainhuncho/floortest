/**
 * A sender's name, email and profiles, remembered on this device so the next send is just the file. Kept only for
 * SENDER_TTL_MS: on a shared computer, the next person on any send page shouldn't find them filled in days later.
 */
export type RememberedSender = { name: string; email: string; instagram: string; streaming: string };

export const SENDER_TTL_MS = 12 * 3_600_000;

export const rememberSender = (s: RememberedSender, at = Date.now()) => JSON.stringify({ ...s, at });

/** The remembered details, or null when there are none, they're past the time limit, or they're unreadable. */
export function recallSender(raw: string, at = Date.now()): RememberedSender | null {
  try {
    const s = JSON.parse(raw || "null") as Partial<RememberedSender> & { at?: unknown };
    if (!s || typeof s.at !== "number" || s.at > at || at - s.at > SENDER_TTL_MS) return null;
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    return { name: text(s.name), email: text(s.email), instagram: text(s.instagram), streaming: text(s.streaming) };
  } catch {
    return null;
  }
}
