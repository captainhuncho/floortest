import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against a throwaway local copy of FloorTest (fresh seeded data in .e2e/, local file
 * storage, no email sending, no bot check, no site password). Nothing here can touch the live database, R2 or Resend.
 * Run: npm run e2e (stop any other dev server first: they'd share the .next folder).
 */
const PORT = 3210;
const env = {
  DATA_DIR: ".e2e/data",
  DATABASE_URL: "",
  STORAGE_DRIVER: "local",
  S3_BUCKET: "",
  RESEND_API_KEY: "",
  TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  SITE_PASSWORD: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  NEXT_PUBLIC_SENTRY_DSN: "",
  OPS_URL: "",
  BETA_INVITE_CODES: "E2E-INVITE",
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
