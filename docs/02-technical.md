# 02 · Technical requirements

What FloorTest is built on, so nobody guesses. Change a tool, service or limit → update this file in the same commit.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, server components, server actions), React 19, TypeScript | `src/app`; "use server" files export only async functions |
| Styling | Tailwind CSS 4 (`@theme` tokens in `src/app/globals.css`) | design rules in 04 |
| Database | Postgres: **Neon** (London) in production; separate database for Preview builds; **PGlite** in `./data` locally | raw SQL via `q` helpers in `src/lib/db`; migrations in `src/lib/db/migrations.ts` (append-only, run by `vercel-build`) |
| Files | **Cloudflare R2** (S3 API, private bucket); local disk in development | audio, stems, covers, artwork; signed URLs; uploads go browser → R2 directly |
| Hosting | **Vercel**, region lhr1 (London); Hobby now, **Pro before launch** | `main` deploys production; `mobile-next` is the working branch |
| Email | **Resend** (sending + delivery webhook `/api/webhooks/resend`) | outbox table; suppression list; account emails capped per hour platform-wide |
| Auth | Own sessions (hashed tokens, HttpOnly cookie); scrypt passwords; TOTP two-factor; Google OAuth (state + PKCE, `sub` pinned) | `src/lib/auth.ts`, `security.ts`, `google-auth.ts` |
| Bot check | Cloudflare Turnstile on public forms (switch `bot_check`) | |
| Monitoring | Sentry (`/api/monitoring` tunnel), Vercel Analytics, own incidents + job runs in ops | |
| Images | sharp: covers, collection art, site images resized to WebP. Track artwork is **not** re-encoded | `src/lib/image-optimize.ts` |
| Audio analysis | In the browser (duration, BPM, waveform peaks); tags via music-metadata | |
| Site editing | Draft mode + signed preview cookie from ops; `src/lib/site-editor.ts` (permission), `/api/site-edit` (+ `/image`), `src/components/SiteEditor.tsx`, shared save in `src/lib/content-write.ts` | |
| Scheduled jobs | Vercel Cron: `/api/cron/digest`, `/api/cron/purge` (retention, storage deletions) | |

## Hosts
- `floortest.app` — product (behind the coming-soon password until launch; legal pages public).
- `ops.floortest.app` — ops only, own sign-in with two-factor every time; proxy splits hosts (`src/proxy.ts`).
- DNS at the domain's cPanel host (Zone Editor): A `216.198.79.1` + `64.29.17.1`, `www`/`ops` CNAME to Vercel. Mail records belong to the host and Resend: don't touch.

## Limits and guards
- Upload 250 MB per file, 3 tracks per send, 12 per folder; artwork 25 MB.
- Rate limits: per IP on public forms, per email on email-sending forms, per user on signed-in actions (`src/lib/ratelimit.ts`, table `rate_events`). Platform cap on account emails per hour (`ACCOUNT_EMAIL_CAP`, default 300).
- Every ops page/action names a permission or the build fails (`scripts/check-admin-perms.ts`).

## Settings (Vercel environment variables)
`DATABASE_URL`, `APP_URL`, `APP_SECRET`, `OPS_URL`, `ADMIN_EMAILS`, `S3_*`, `STORAGE_DRIVER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_FROM`, `SUPPORT_EMAIL`, `TURNSTILE_*`, `GOOGLE_CLIENT_ID/SECRET`, `CRON_SECRET`, `BACKUP_KEY`, `SITE_PASSWORD`, `BETA_INVITE_CODES`, `DB_POOL_MAX`, `NEXT_PUBLIC_SENTRY_DSN`, optional `ACCOUNT_EMAIL_CAP`. Values never go in the repo or chat.

## Working rules
- `npm run dev` / `typecheck` / `test` / `check:perms`; run migrations or scripts against a scratch `DATA_DIR`, never `./data` while the dev server runs.
- Deploy = merge `mobile-next` into `main` and push; confirm the production deploy is READY.
- More: `docs/CODE_STYLE.md`, `docs/API_GUIDE.md`, `docs/DATABASE.md`, `docs/services.md`, `SECURITY.md`.
