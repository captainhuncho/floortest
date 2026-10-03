import "server-only";
import { cache } from "react";
import { now, q, type Queryable } from "./db";

/**
 * Site-wide switches, flipped from Admin → Feature switches with no deploy. Each is off or on;
 * `initial` is its state until an admin first changes it.
 */
export const SWITCHES = {
  sharing: {
    label: "Sharing with colleagues",
    description: "Receivers share a track with colleagues who have FloorTest accounts, and ask artists for consent. Held until after the beta and the lawyer's wording.",
    initial: false,
  },
  bot_check: {
    label: "Bot check on public forms",
    description: "Cloudflare Turnstile on sign-up, waitlist, contact and anonymous uploads. Turn off at once if people report they can't get past it.",
    initial: true,
  },
  open_signup: {
    label: "Open sign-up",
    description: "Anyone can create an account. Off means an invite code is needed (the beta).",
    initial: false,
  },
  billing: {
    label: "Paid plans and checkout",
    description: "Off: checkout applies the beta discount (total $0.00). On: the discount goes and checkout charges by card. Keep off until card payments are connected and the lawyer has approved the renewal wording.",
    initial: false,
  },
  uploads_paused: {
    label: "Pause all uploads",
    description: "Maintenance switch: every receiver's link stops taking new tracks, with a short notice to senders. Nothing is lost.",
    initial: false,
  },
} as const;
export type SwitchKey = keyof typeof SWITCHES;

const all = cache(async () => {
  const rows = await q.all<{ key: string; on: number }>("SELECT key, on_ AS on FROM switches");
  return new Map(rows.map((r) => [r.key, !!Number(r.on)]));
});

/** Pass `db` when inside a transaction, so the read uses the transaction's connection instead of waiting on a second one. */
export async function switchOn(key: SwitchKey, db?: Queryable) {
  if (db) {
    const row = await db.get<{ on: number }>("SELECT on_ AS on FROM switches WHERE key = ?", key);
    return row ? !!Number(row.on) : SWITCHES[key].initial;
  }
  return (await all()).get(key) ?? SWITCHES[key].initial;
}

export async function setSwitch(key: SwitchKey, on: boolean, adminId: number) {
  await q.run(
    "INSERT INTO switches (key, on_, admin_id, updated_at) VALUES (?,?,?,?) ON CONFLICT (key) DO UPDATE SET on_ = excluded.on_, admin_id = excluded.admin_id, updated_at = excluded.updated_at",
    key,
    on ? 1 : 0,
    adminId,
    now(),
  );
}
