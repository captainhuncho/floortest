import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against a throwaway local copy of FloorTest (fresh seeded data in .e2e/, local file
 * storage, no email sending, Cloudflare's always-pass test keys for the bot check, no site password). Nothing here can touch the live database, R2 or Resend.
 * Run: npm run e2e (stop any other dev server in the same folder first: they'd share the .next folder).
 * Two runs in different worktrees can go side by side on their own ports (owner, 31 Oct):
 * E2E_PORT=3220 E2E_SCANNER_PORT=3221 E2E_MAIL_PORT=3222 npm run e2e. The defaults stay 3210, 3211 and 3212.
 */
const PORT = Number(process.env.E2E_PORT || 3210);
const SCANNER_PORT = Number(process.env.E2E_SCANNER_PORT || 3211);
const MAIL_PORT = Number(process.env.E2E_MAIL_PORT || 3212);
const env = {
  DATA_DIR: ".e2e/data",
  DATABASE_URL: "",
  STORAGE_DRIVER: "local",
  S3_BUCKET: "",
  RESEND_API_KEY: "",
  // Cloudflare's published test keys: the check always passes, with no real puzzle (developers.cloudflare.com/turnstile/troubleshooting/testing).
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  SITE_PASSWORD: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  NEXT_PUBLIC_SENTRY_DSN: "",
  OPS_URL: "",
  // Sign-up is invite-only in the beta (switch open_signup; the invite rules are tests/invites.test.ts). The test copy
  // opens it so each test can make fresh accounts (scripts/seed.ts).
  SEED_OPEN_SIGNUP: "1",
  // Collection share links are tested here, so the test copy has sharing switched on (scripts/seed.ts).
  SEED_SHARING: "1",
  // Account teams are tested too: teams switched on and a seeded team member (scripts/seed.ts).
  SEED_TEAMS: "1",
  // The Send page is off in the beta (switch send_music); its tests switch it on (scripts/seed.ts).
  SEED_SEND_MUSIC: "1",
  // Ops is tested too: a seeded ops account with two-step on (scripts/seed.ts, e2e/ops-account.ts), the super admin here only.
  SEED_OPS: "1",
  // The private link pages (receipt, sender history, team invite, email links) are tested with known links (scripts/seed.ts).
  SEED_LINK_PAGES: "1",
  ADMIN_EMAILS: "ops@floortest.test",
  // A fake virus scanner (e2e/fake-scanner.mjs): every file is clean, but scanner-wake.spec.ts makes it sleep or stay
  // down. The wait for a waking scanner is cut from 150 s to 6 s so those tests stay short.
  SCAN_URL: `http://127.0.0.1:${SCANNER_PORT}`,
  SCAN_SECRET: "e2e-fake-scanner-secret-not-used-anywhere-else",
  SCAN_DEADLINE_MS: "6000",
  // scanner-wake.spec.ts runs the held-uploads job (/api/cron/scan-held) itself, with this secret.
  CRON_SECRET: "e2e-cron-secret-not-used-anywhere-else",
  // A fake inbox (e2e/fake-mail.mjs): with no Resend key, emails that are only logged also go there, so a test can read
  // a code it was sent (src/lib/mail.ts, MAIL_SINK_URL; never in a production build).
  MAIL_SINK_URL: `http://127.0.0.1:${MAIL_PORT}/mail`,
  APP_URL: `http://localhost:${PORT}`,
  APP_SECRET: "e2e-only-secret-not-used-anywhere-else-000000",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: "node e2e/fake-mail.mjs",
      url: `http://127.0.0.1:${MAIL_PORT}/status`,
      reuseExistingServer: false,
      env: { FAKE_MAIL_PORT: String(MAIL_PORT) },
    },
    {
      command: "node e2e/fake-scanner.mjs",
      url: `http://127.0.0.1:${SCANNER_PORT}/status`,
      reuseExistingServer: false,
      env: { FAKE_SCANNER_PORT: String(SCANNER_PORT), SCAN_SECRET: env.SCAN_SECRET },
    },
    {
      // The dev cache (.next/dev) is cleared first: after a branch switch a stale one made the dev server reload every
      // page, so forms never sent and the sign-up tests failed (29 Oct). The seeded data is fresh each run anyway.
      command: `node -e "require('fs').rmSync('.next/dev',{recursive:true,force:true})" && npx tsx scripts/seed.ts && npx next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env,
    },
  ],
});
