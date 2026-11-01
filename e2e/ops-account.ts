/**
 * The ops test account (test runs only): seeded by scripts/seed.ts when SEED_OPS=1 with two-step sign-in already on,
 * and made the super admin by ADMIN_EMAILS in playwright.config.ts. The secret is a throwaway test value that exists
 * only in the test copy's database, so e2e/ops-actions.spec.ts can make the two-step code ops sign-in asks for.
 */
export const OPS_EMAIL = "ops@floortest.test";
export const OPS_TOTP_SECRET = "E2EOPSTESTSECRETNOTUSEDANYWHERE2";
/** The inbox message the spec marks handled and reopens. */
export const OPS_INBOX_MESSAGE = "E2E: is the Inbox Handled button answering in place?";
/** The feedback item e2e/ops-kit.spec.ts moves between statuses with the Feedback switch. */
export const OPS_FEEDBACK_MESSAGE = "E2E: does the Feedback status switch answer in place?";
/** Moderation's seeded signals (e2e/ops-moderation.spec.ts): a track with an open takedown claim, and one from a blocked sender. */
export const OPS_CLAIMED = { title: "Claimed Groove", artist: "Kofi Claim", sender: "Kofi Claim", email: "kofi.claim@example.com" };
export const OPS_BLOCKED = { title: "Spam Loop", artist: "Sly Spammer", sender: "Sly Spammer", email: "sly.spam@example.com" };
