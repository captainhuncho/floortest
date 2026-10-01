import "server-only";

/**
 * All configuration, read from the environment. See .env.example for descriptions.
 * `configProblems()` lists anything that would break production; /api/health reports it.
 */
const v = (k: string) => (process.env[k] ?? "").trim() || undefined;

export const isProd = process.env.NODE_ENV === "production";
/** A Vercel preview deployment: separate database and bucket, fictional data only. */
export const isPreview = process.env.VERCEL_ENV === "preview";

export const env = {
  /** Previews use their own address, so links and emails never point at the live site. */
  appUrl: (isPreview && v("VERCEL_URL") ? `https://${v("VERCEL_URL")}` : (v("APP_URL") ?? "http://localhost:3000")).replace(/\/$/, ""),
  /** Signs local upload tokens. Must be long and random in production. */
  get secret(): string {
    const s = v("APP_SECRET");
    // The live site never falls back to the public dev secret: anything signed with it could be forged.
    if (!s && process.env.VERCEL_ENV === "production") throw new Error("APP_SECRET is not set. Refusing to sign or check tokens without it.");
    return s ?? "dev-only-secret-change-me";
  },
  databaseUrl: v("DATABASE_URL"),
  storage: {
    driver: (v("STORAGE_DRIVER") ?? (v("S3_BUCKET") ? "s3" : "local")) as "local" | "s3",
    s3: {
      bucket: v("S3_BUCKET"),
      region: v("S3_REGION") ?? "auto",
      endpoint: v("S3_ENDPOINT"),
      accessKeyId: v("S3_ACCESS_KEY_ID"),
      secretAccessKey: v("S3_SECRET_ACCESS_KEY"),
      forcePathStyle: v("S3_FORCE_PATH_STYLE") === "true",
    },
  },
  email: {
    resendKey: v("RESEND_API_KEY"),
    from: v("MAIL_FROM") ?? "FloorTest <onboarding@resend.dev>",
    replyTo: v("MAIL_REPLY_TO"),
  },
  cronSecret: v("CRON_SECRET"),
  /** "invite" (default in production): signing up needs an invite code. "open": anyone can sign up. */
  signupMode: (v("SIGNUP_MODE") ?? (isProd ? "invite" : "open")) as "invite" | "open",
  /** Comma-separated codes that let someone sign up in invite mode (besides existing users' referral codes). */
  inviteCodes: (v("BETA_INVITE_CODES") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean),
  supportEmail: v("SUPPORT_EMAIL"),
  /** Accounts (by email) that can open /admin. They must also have two-factor sign-in on. */
  adminEmails: (v("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /** Sign-ups allowed per BETA_INVITE_CODES code, so a leaked code cannot open the doors. */
  inviteLimit: Math.max(1, Number(v("BETA_INVITE_LIMIT") ?? 25) || 25),
};

export function configProblems() {
  const p: string[] = [];
  if (!isProd) return p;
  if (!v("APP_URL")) p.push("APP_URL is not set: emails and links will point at localhost.");
  if (!v("APP_SECRET") || env.secret.length < 32) p.push("APP_SECRET must be set to a random string of 32+ characters.");
  if (!env.databaseUrl) p.push("DATABASE_URL is not set: data is stored in an embedded database on local disk.");
  if (env.storage.driver === "local") p.push("STORAGE_DRIVER is local: audio is stored on local disk.");
  if (env.storage.driver === "s3") {
    const s = env.storage.s3;
    for (const [k, val] of [["S3_BUCKET", s.bucket], ["S3_ACCESS_KEY_ID", s.accessKeyId], ["S3_SECRET_ACCESS_KEY", s.secretAccessKey]] as const)
      if (!val) p.push(`${k} is not set.`);
  }
  if (!env.email.resendKey) p.push("RESEND_API_KEY is not set: emails are only logged, never delivered.");
  if (!env.cronSecret) p.push("CRON_SECRET is not set: scheduled jobs are disabled.");
  if (!env.supportEmail) p.push("SUPPORT_EMAIL is not set: contact-form messages aren't delivered anywhere.");
  
  return p;
}
