# Services behind FloorTest

Every outside service used to build, run and monitor FloorTest, and what each one is for. **No passwords, keys or tokens belong in this file**; they live only in each service's dashboard and in Vercel's environment variables.

Last updated 13 Oct 2026.

## Running the site

| Service | What it does | Account / project | Where to manage it |
| --- | --- | --- | --- |
| **Vercel** | Hosts the website and runs the code (London region). Also runs the daily scheduled jobs: digests, nudges, clean-up. | Team `maxwelladjavon-5776s-projects`, project **floortest** | vercel.com → floortest. Secrets: Settings → Environment Variables |
| **Neon** | The database (accounts, tracks, decisions, logs): Postgres in London (AWS eu-west-2), next to Vercel's `lhr1`. Free plan now; Launch before public launch (owner, 15 Oct), which brings a 7-day restore window: any moment in it can be restored as a new branch (Branches → Restore), checked, then pointed at by `DATABASE_URL`; production is never overwritten in place. | Production and Preview each have their own database; the app uses the pooled connection | console.neon.tech |
| **Cloudflare R2** | Stores the audio, stems, cover photos and nightly database backups, privately. | Buckets: **floortest-audio-eu** (live, Western Europe, since 11 Oct), **floortest-audio-preview** (previews only), **floortest-audio** (old, kept for rollback; the owner deletes it on/after 18 Oct) | dash.cloudflare.com → R2 |
| **Cloudflare Turnstile** | The bot check on public forms and on sign-in after repeated wrong tries. | One widget; on/off is the `bot_check` switch in ops | dash.cloudflare.com → Turnstile |
| **Google Cloud** | Sign in with Google (OAuth client). | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set for Production and Preview; brand verification paused until launch (plan B1) | console.cloud.google.com → APIs & Services → Credentials |
| **Resend** | Sends every email: receipts, alerts, invites, digests. | Sending domain `floortest.app` (verified), from `team@floortest.app` | resend.com |
| **Google Workspace** | Two separate inboxes: `team@floortest.app` sends every FloorTest email and gets the replies; `support@floortest.app` (`SUPPORT_EMAIL`) takes help, takedowns and the contact form. `hello@` (the sender until 13 Oct) stays as an alias for late replies. | `floortest.app` is a secondary domain on the owner's existing Workspace: `team@` is its own user; support@, legal@, privacy@, copyright@, security@ and hello@ are the owner's; nobody else gets an address | admin.google.com |
| **Have I Been Pwned** (Pwned Passwords) | Tells us whether a new password has appeared in a data breach, so it can be refused. | Free range API, no account or key. Only the first 5 characters of the password's SHA-1 are sent (k-anonymity, padded); the password never leaves the server. Off locally; `PWNED_CHECK=0` turns it off | haveibeenpwned.com/Passwords |

## Domain

| Service | What it does | Details |
| --- | --- | --- |
| **Hosting.com** | Registrar and DNS (cPanel) for `floortest.app`, and DNS for the old `imullar.com`. | A records point `floortest.app` to Vercel (`216.198.79.1`, `64.29.17.1`); `www`, the old `floortest.imullar.com` and `floortest.vercel.app` redirect to it. The Resend and Google Workspace mail records live here too. |

## Monitoring

| Service | What it does | Details |
| --- | --- | --- |
| **UptimeRobot** | Checks the site every 5 minutes and emails if it's down. | Monitors `https://floortest.app/api/health`, which replies `"ok": true` when the site and database are working. |
| **Sentry** | Crash and error reports from the site, sent through the app's own `/api/monitoring` route; private link keys are removed first. | Free Developer plan; `NEXT_PUBLIC_SENTRY_DSN` |
| **Vercel Analytics** | Page views. | On the Vercel project |
| **FloorTest ops** | In-app monitoring: incidents (errors), email log, metrics, storage checks, weekly admin digest email. | `ops.floortest.app`, its own sign-in with two-factor every time; needs an address in `ADMIN_EMAILS`. |

## Code

| Service | What it does | Details |
| --- | --- | --- |
| **GitHub** | Stores the code and its history. | Repo `captainhuncho/floortest`: `main` is production, `mobile-next` the working branch (previews). The project folder on the Mac is `~/floortest`. |

## Contacts used on the site

- **support@floortest.app**: help and the contact form (Vercel `SUPPORT_EMAIL`).
- **legal@**, **privacy@**, **copyright@**, **security@floortest.app**: legal notices, data requests, takedown notices, security reports. Created 13 Oct and shown on the legal pages (`LEGAL` in `src/lib/legal.ts`: legal@ for the Terms, content rules and law enforcement; privacy@ for Privacy, Cookies, privacy choices and Sub-processors; copyright@ for takedowns; security@ for the Security page). The lawyer confirms the mapping (brief question 30).
- FloorTest's own emails come from **team@floortest.app**, and replies go there (`MAIL_FROM`; `MAIL_REPLY_TO` is unset on purpose).
- Operator named in Terms and Privacy: **FloorTest Labs**, being registered in Ghana. Change it in `src/lib/legal.ts`.

## Where each setting lives

| Setting (Vercel env) | Live | Preview |
| --- | --- | --- |
| `DATABASE_URL` | Neon production database | Neon preview database |
| `S3_BUCKET` + R2 keys | floortest-audio-eu | floortest-audio-preview (its own key) |
| `S3_ENDPOINT`, `S3_REGION`, `STORAGE_DRIVER` | shared | shared |
| `APP_SECRET` | own value | own value |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | set | set |
| `APP_URL` | `https://floortest.app` | `https://floortest.vercel.app` |
| `RESEND_API_KEY`, `MAIL_FROM`, `RESEND_WEBHOOK_SECRET` | set | not set: preview emails are only logged |
| `SUPPORT_EMAIL` | support@floortest.app | not set |
| `SIGNUP_MODE` | invite | open |
| `ADMIN_EMAILS`, `OPS_URL`, `CRON_SECRET`, `BACKUP_KEY`, `TURNSTILE_*`, `SITE_PASSWORD` | set | not set |
| `BETA_INVITE_CODES`, `NEXT_PUBLIC_SENTRY_DSN`, `DB_POOL_MAX`, `DB_AUTO_MIGRATE` | set | set |

## Planned, not yet connected

- **Virus scanner** (`scanner/`, our own ClamAV): code ready 12 Oct, off until `SCAN_URL` / `SCAN_SECRET` are set. Host: Cloudflare Containers (owner, 14 Oct; no new subprocessor), about $25–30 a month with Workers Paid; deploy steps in `scanner/README.md`. Files never go to a third-party scanner.
- **Recovery copy** (`src/lib/vault.ts`): code ready 12 Oct; bucket `floortest-vault` (WEUR, private) and `BACKUP_BUCKET` set 13 Oct; off until the owner sets `BACKUP_ACCESS_KEY_ID` and `BACKUP_SECRET_ACCESS_KEY` (plan item 5).
- **Paddle** for payments, monthly and yearly (plan item 2).
- **Apple Developer** and **Google Play** accounts for the phone apps (owner).
- **Lawyer** covering Ghana and UK/EU data protection. The brief is in `docs/legal-review.md`.

## Old, to remove

- **Supabase**: the database before Neon. Projects **floortest** (`crghwblbuodxhsfgeppw`), **floortest-preview** (`azvsdmrnwunbpdyitoji`) and an older one (`culzghp…`, paused 29 Sep) are no longer used and cost nothing; the owner deletes them (from 13 Oct).
