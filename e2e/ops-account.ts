/**
 * The ops test account (test runs only): seeded by scripts/seed.ts when SEED_OPS=1 with two-step sign-in already on,
 * and made the super admin by ADMIN_EMAILS in playwright.config.ts. The secret is a throwaway test value that exists
 * only in the test copy's database, so e2e/ops-actions.spec.ts can make the two-step code ops sign-in asks for.
 */
export const OPS_EMAIL = "ops@floortest.test";
export const OPS_TOTP_SECRET = "E2EOPSTESTSECRETNOTUSEDANYWHERE2";
/** The inbox message the spec marks handled and reopens. */
export const OPS_INBOX_MESSAGE = "E2E: is the Inbox Handled button answering in place?";
