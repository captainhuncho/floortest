import "server-only";
import { cache } from "react";
import { now, q, type Queryable } from "./db";

/**
 * Site-wide switches, flipped from Admin → Feature switches with no deploy. Each is off or on;
 * `initial` is its state until an admin first changes it.
 */
export const SWITCHES = {
  sharing: {
    label: "Collection share links",
    description: "Receivers share collections privately with people they name (verified by email), and the Terms, Privacy and Cookie pages show the private-sharing wording. Held until the lawyer approves that wording.",
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
  teams: {
    label: "Account teams",
    description: "Owners invite people onto their account (seats by plan: Free 1, Pro 2, Team 5, plus add-on seats); each person keeps their own login and switches desks from the sidebar.",
    initial: false,
  },
  more_collections: {
    label: "More than two collections",
    description: "Off (the beta, owner 15 Oct): each desk holds two collections. On: as many as people want.",
    initial: false,
  },
  send_music: {
    label: "Send music between desks",
    description: "Off (the beta): receivers don't send to other receivers from FloorTest; the Send page, its sidebar item, the Floor's Send music and Account's row are hidden. Senders still send through anyone's link.",
    initial: false,
  },
  referrals: {
    label: "Referrals page",
    description: "Off (the beta): the Referrals page and its links are hidden. Invite codes and links people already have keep working.",
    initial: false,
  },
  plan_requests: {
    label: "Plan requests",
    description: "Off (the beta): the Plans page shows the plans without Request buttons, and the request form is closed. FloorTest sets plans from ops.",
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
