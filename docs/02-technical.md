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
| Bot check | Cloudflare Turnstile on public forms (switch `bot_check`), and on sign-in after 3 wrong tries in 15 min per account or connection (log-in, email codes, ops) — enforced on the server (`src/lib/human-check.ts`) | |
| Monitoring | Sentry (`/api/monitoring` tunnel), Vercel Analytics, own incidents + job runs in ops | |
| Images | sharp: covers, collection art, site images resized to WebP. Track artwork is **not** re-encoded | `src/lib/image-optimize.ts` |
| Audio analysis | In the browser (duration, BPM, waveform peaks); tags via music-metadata | |
| Site editing | Draft mode + signed preview cookie bound to the ops session (token hash); `src/lib/site-editor.ts` (permission), `/api/site-edit` (+ `/image`), `src/components/SiteEditor.tsx`, shared save in `src/lib/content-write.ts` | |
| App API | `/api/v1` for the mobile app (`src/lib/app-auth.ts`, `src/lib/api-v1.ts`): `auth/login` (same counters, human check and two-step as the web), `auth/refresh` (rotating), `auth/logout`, `me`, `queue`, `tracks/:id/decision`, `tracks/:id/audio` (signed link), `receivers/:handle` (same lookup as the Send page), `sends` (GET your sends; POST starts one → `{uploadId, target}`, PUT the file to `target`), `sends/complete`, `collections`, `collections/:id`, `prepare`. Sends use the same checks as the website (`src/lib/submission.ts`, `src/lib/receiver-lookup.ts`, `src/lib/sent.ts`). Refresh tokens are `sessions` rows with kind `app` (60 days); access tokens are signed, 15 minutes, re-checked against the session on every request | |
| Batch actions | `batchTracks` (`src/app/dashboard/actions/batch.ts`, cap `BATCH_MAX` 200 in `src/lib/batch.ts`, 60 per hour): only the receiver's own live tracks, one activity-log line per batch; delete needs `confirm: "delete"`. Download a selection: `/api/export?ids=…` | |
| Mobile app | `mobile/`: Capacitor 8 shell for iOS and Android that opens floortest.app/dashboard/floor; app id `app.floortest`; no database or storage keys. Prototype: `cd mobile && FLOORTEST_URL=http://localhost:3000 npx cap sync ios`, then build in Xcode / the simulator. Excluded from the website's type check and Vercel deploys. Sync with `npm run sync` (writes the offline screen's start address). The website knows it's inside the app via `src/components/NativeApp.tsx` (class `native-app`). **Share to FloorTest**: a share extension (`ios/App/ShareExtension`, bundle `app.floortest.share`) copies WAV/MP3s into the app group `group.app.floortest` (`Inbox/<uuid>/<file>`, cleared after a day) and opens `floortest://send`; the app then loads `/dashboard/send`, which reads the files through the `ShareInbox` plugin (`ShareInboxPlugin.swift`, `src/lib/native-share.ts`, 2 MB base64 pieces) into the normal send form. **Android** (`mobile/android`, same app id): Share to FloorTest is an intent filter for `audio/*` on `MainActivity` (copies into `files/Inbox`, same `ShareInbox` plugin API as iOS); Back goes back a page; dark bars (`SystemBars` style DARK); icon and splash from `mobile/scripts/android-assets.mjs`; debug builds alone allow http for the local site. Background audio + notification/lock-screen player: `PlaybackService` (foreground service, type mediaPlayback, MediaSession) driven by the `NowPlaying` plugin, which the web player feeds through `src/lib/native-now-playing.ts` (no-op elsewhere; iOS uses the web Media Session). Build: Gradle 9.1 with Android Studio's bundled Java (`JAVA_HOME=…/Android Studio.app/Contents/jbr/Contents/Home`); try it with `adb reverse tcp:3000 tcp:3000` after `FLOORTEST_URL=http://localhost:3000 npm run sync`; run `npm run sync` again (no URL) before committing. The offline screen (`www/index.html`) carries its start address and crest inline. **Offline kept tracks**: `OfflineCrate` plugin (`OfflineCratePlugin.swift`, `OfflineCratePlugin.java`; `src/lib/native-offline.ts`; `src/app/dashboard/prepare/OfflineSave.tsx`) syncs from `GET /api/offline/list` (signed in; each track gets a one-hour link `GET /api/offline/file/:token`, `src/lib/offline.ts`, HMAC over track + receiver + expiry) into private, not-backed-up storage with a `manifest.json`; the offline screen plays them via `Capacitor.convertFileSrc`. On Android the offline screen is served at `https://localhost` (not the site), so `MainActivity.bridgeOnOfflineScreen` injects Capacitor's bridge there too |
| Scheduled jobs | Vercel Cron: `/api/cron/digest` (re-routes links off closed collections for receivers who turned it on (`users.reroute_closed`) and sends "when it reopens" emails first — `src/lib/reopen.ts` — then digests and nudges), `/api/cron/purge` (retention, storage deletions) | |

## Hosts
- `floortest.app` — product (everything behind the coming-soon password until launch, legal pages included).
- `ops.floortest.app` — ops only, own sign-in with two-factor every time; proxy splits hosts (`src/proxy.ts`).
- DNS at the domain's cPanel host (Zone Editor): A `216.198.79.1` + `64.29.17.1`, `www`/`ops` CNAME to Vercel. Mail records belong to the host and Resend: don't touch.

## Limits and guards
- Upload 250 MB per file, 3 tracks per send, 12 per folder; artwork 25 MB.
- Rate limits: per IP on public forms (incl. "Email me when it reopens", 5/hour), per email on email-sending forms, per user on signed-in actions (`src/lib/ratelimit.ts`, table `rate_events`). Platform cap on account emails per hour (`ACCOUNT_EMAIL_CAP`, default 300).
- Every ops page/action names a permission or the build fails (`scripts/check-admin-perms.ts`).

## Settings (Vercel environment variables)
`DATABASE_URL`, `APP_URL`, `APP_SECRET`, `OPS_URL`, `ADMIN_EMAILS`, `S3_*`, `STORAGE_DRIVER`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_FROM`, `SUPPORT_EMAIL`, `TURNSTILE_*`, `GOOGLE_CLIENT_ID/SECRET`, `CRON_SECRET`, `BACKUP_KEY`, `SITE_PASSWORD`, `BETA_INVITE_CODES`, `DB_POOL_MAX`, `NEXT_PUBLIC_SENTRY_DSN`, optional `ACCOUNT_EMAIL_CAP`. Values never go in the repo or chat.

## Working rules
- `npm run e2e`: Playwright end-to-end tests (`e2e/`) in a real browser against a throwaway local copy (fresh seeded data in `.e2e/`, local storage, no email/bot check/site password; port 3210). Covers sign-up with invite → send a WAV → receiver keeps → Download kept ZIP, plus batch actions, the app API, offline links and security guards. Stop other dev servers first.
- `npm run dev` / `typecheck` / `test` / `check:perms`; run migrations or scripts against a scratch `DATA_DIR`, never `./data` while the dev server runs.
- Deploy = merge `mobile-next` into `main` and push; confirm the production deploy is READY.
- More: `docs/CODE_STYLE.md`, `docs/API_GUIDE.md`, `docs/DATABASE.md`, `docs/services.md`, `SECURITY.md`.
