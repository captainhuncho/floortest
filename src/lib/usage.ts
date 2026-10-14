import "server-only";
import { after } from "next/server";
import { q } from "./db";
import { viewingAs } from "./auth";

/** The parts of FloorTest we count, with the names Admin → Feature use shows. */
export const FEATURES_USED = {
  floor: "The Floor",
  review_queue: "Queue: one by one",
  review_list: "Queue: List view",
  decide: "Keep / Not for me",
  reply: "Reply to a sender",
  played_out: "Mark played out",
  collections: "Collections",
  collection: "A collection's page",
  shared: "Shared collection (teammate)",
  vote: "Team vote",
  teammates: "Add a teammate",
  prepare: "Prepare",
  export: "Download crate / Rekordbox",
  send: "Send music",
  contacts: "Contacts",
  activity: "Activity",
  notifications: "Notifications",
  plans: "Plans",
  settings: "Settings",
  referrals: "Referrals",
} as const;
export type FeatureUsed = keyof typeof FEATURES_USED;

/**
 * Counts one use of a feature for this account today, after the response is sent, so it never slows anything down.
 * Only what was used and how often: no content. An admin viewing someone's desk isn't counted.
 */
export async function trackUse(userId: number, feature: FeatureUsed) {
  // Checked now: request details (cookies) can't be read inside after() on a page.
  if (await viewingAs().catch(() => null)) return;
  after(async () => {
    const day = new Date().toISOString().slice(0, 10);
    await q
      .run(
        `INSERT INTO feature_use (user_id, feature, day, uses) VALUES (?,?,?,1)
         ON CONFLICT (user_id, feature, day) DO UPDATE SET uses = feature_use.uses + 1`,
        userId,
        feature,
        day,
      )
      .catch(() => {});
  });
}
