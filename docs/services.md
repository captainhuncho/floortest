# Services behind FloorTest

Every outside service used to build, run and monitor FloorTest, and what each one is for. **No passwords, keys or tokens belong in this file**; they live only in each service's dashboard and in Vercel's environment variables.

Last updated 29 Sep 2026.

## Running the site

| Service | What it does | Account / project | Where to manage it |
| --- | --- | --- | --- |
| **Vercel** | Hosts the website and runs the code (London region). Also runs the daily scheduled jobs: digests, nudges, clean-up. | Team `maxwelladjavon-5776s-projects`, project **floortest** | vercel.com → floortest. Secrets: Settings → Environment Variables |
| **Supabase** | The database (accounts, tracks, decisions, logs). | Org **FloorTest**. Live: **floortest** (`crghwblbuodxhsfgeppw`, London). Preview: **floortest-preview** (`azvsdmrnwunbpdyitoji`, London). Old: `culzghp…`, paused 29 Sep 2026; reminder set for 14 Dec 2026 to delete it. | supabase.com/dashboard |
| **Cloudflare R2** | Stores the audio files and cover photos, privately. | Buckets: **floortest-audio** (live), **floortest-audio-preview** (tests only) | dash.cloudflare.com → R2 |
| **Resend** | Sends every email: receipts, alerts, invites, digests. | Sending domain `floortest.app` (verified), from `team@floortest.app` | resend.com |
| **Google Workspace** | Two separate inboxes: `team@floortest.app` sends every FloorTest email and gets the replies; `support@floortest.app` (`SUPPORT_EMAIL`) takes help, takedowns and the contact form. `hello@` (the sender until 13 Oct) stays as an alias for late replies. | `floortest.app` is a secondary domain on the owner's existing Workspace: `team@` is its own user, `support@` and `hello@` are alternative addresses on the owner's user; nobody else gets an address | admin.google.com |

## Domain

| Service | What it does | Details |
| --- | --- | --- |
| **Hosting.com** | Registrar and DNS (cPanel) for `floortest.app`, and DNS for the old `imullar.com`. | A records point `floortest.app` to Vercel (`216.198.79.1`, `64.29.17.1`); `www`, the old `floortest.imullar.com` and `floortest.vercel.app` redirect to it. The Resend and Google Workspace mail records live here too. |

## Monitoring

| Service | What it does | Details |
| --- | --- | --- |
| **UptimeRobot** | Checks the site every 5 minutes and emails if it's down. | Monitors `https://floortest.app/api/health`, which replies `"ok": true` when the site and database are working. |
| **FloorTest admin** | In-app monitoring: incidents (errors), email log, metrics, weekly admin digest email. | `floortest.app/admin`. Needs an admin email and two-factor sign-in. |

## Code

| Service | What it does | Details |
| --- | --- | --- |
| **GitHub** | Stores the code and its history. | Repo `captainhuncho/floortest`, branch `main`. The project folder on the Mac is `~/floortest`. |

## Contacts used on the site

- Support, privacy and data requests: **info@imullar.com** (temporary; an @floortest.app address later). The contact form sends here (Vercel `SUPPORT_EMAIL`).
- Operator named in Terms and Privacy: **FloorTest Labs**, being registered in Ghana. Change it in `src/lib/legal.ts`.

## Where each setting lives

| Setting (Vercel env) | Live | Preview |
| --- | --- | --- |
| `DATABASE_URL` | floortest Supabase | floortest-preview Supabase |
| `S3_BUCKET` + R2 keys | floortest-audio | floortest-audio-preview |
| `APP_SECRET` | own value | own value |
| `RESEND_API_KEY`, `MAIL_FROM` | set | not set: preview emails are only logged |
| `SIGNUP_MODE` | invite | open |
| `ADMIN_EMAILS`, `CRON_SECRET`, `SUPPORT_EMAIL` | set | not set |

## Planned, not yet connected

- **Virus scanning** for uploads: beta uses structural checks only (real WAV/MP3, nothing hidden after the audio). Before public launch, add our own ClamAV service (Fly.io or Render, about $13–25/mo for the 2–4 GB of RAM its signatures need; see `docs/costs.md`) that scans each upload before it can be played. Don't send files to third-party scanners (privacy).
- **Lawyer** covering Ghana and UK/EU data protection. The brief is in `docs/legal-review.md`.
