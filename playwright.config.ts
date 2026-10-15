import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against a throwaway local copy of FloorTest (fresh seeded data in .e2e/, local file
 * storage, no email sending, Cloudflare's always-pass test keys for the bot check, no site password). Nothing here can touch the live database, R2 or Resend.
 * Run: npm run e2e (stop any other dev server first: they'd share the .next folder).
 */
const PORT = 3210;
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
  BETA_INVITE_CODES: "E2E-INVITE",
  // Collection share links are tested here, so the test copy has sharing switched on (scripts/seed.ts).
  SEED_SHARING: "1",
  // Account teams are tested too: teams switched on and a seeded team member (scripts/seed.ts).
  SEED_TEAMS: "1",
  // The Send page is off in the beta (switch send_music); its tests switch it on (scripts/seed.ts).
  SEED_SEND_MUSIC: "1",
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
  webServer: {
    command: `npx tsx scripts/seed.ts && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env,
  },
});
