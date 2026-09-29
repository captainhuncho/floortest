# Services behind FloorTest

Every outside service used to build, run and monitor FloorTest, and what each one is for. **No passwords, keys or tokens belong in this file**; they live only in each service's dashboard and in Vercel's environment variables.

Last updated 29 Sep 2026.

## Running the site

| Service | What it does | Account / project | Where to manage it |
| --- | --- | --- | --- |
| **Vercel** | Hosts the website and runs the code (London region). Also runs the daily scheduled jobs: digests, nudges, clean-up. | Team `maxwelladjavon-5776s-projects`, project **floortest** | vercel.com → floortest. Secrets: Settings → Environment Variables |
| **Supabase** | The database (accounts, tracks, decisions, logs). | Org **FloorTest**. Live: **floortest** (`crghwblbuodxhsfgeppw`, London). Preview: **floortest-preview** (`azvsdmrnwunbpdyitoji`, London). Old: `culzghp…`, paused 29 Sep 2026; reminder set for 14 Dec 2026 to delete it. | supabase.com/dashboard |
| **Cloudflare R2** | Stores the audio files and cover photos, privately. | Buckets: **floortest-audio** (live), **floortest-audio-preview** (tests only) | dash.cloudflare.com → R2 |
| **Resend** | Sends every email: receipts, alerts, invites, digests. | Sending domain `floortest.imullar.com` (verified) | resend.com |

## Domain

| Service | What it does | Details |
| --- | --- | --- |
| **TMDHosting** | Holds DNS for `imullar.com`. | An A record points `floortest.imullar.com` to Vercel (`76.76.21.21`). The Resend records live here too. `floortest.vercel.app` redirects to the custom domain. |

## Monitoring

| Service | What it does | Details |
| --- | --- | --- |
| **UptimeRobot** | Checks the site every 5 minutes and emails if it's down. | Monitors `https://floortest.imullar.com/api/health`, which replies `"ok": true` when the site and database are working. |
| **FloorTest admin** | In-app monitoring: incidents (errors), email log, metrics, weekly admin digest email. | `floortest.imullar.com/admin`. Needs an admin email and two-factor sign-in. |

## Code

| Service | What it does | Details |
| --- | --- | --- |
| **GitHub** | Stores the code and its history. | Repo `captainhuncho/floortest`, branch `main`. The project folder on the Mac is `~/floortest`. |

## Contacts used on the site

- Support, privacy and data requests: **info@imullar.com** (temporary; support@floortest.fm later). The contact form sends here (Vercel `SUPPORT_EMAIL`).
- Operator named in Terms and Privacy: **FloorTest LTD**, being registered in Ghana. Change it in `src/lib/legal.ts`.

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

- **Key detection: dropped.** DJs read key in Rekordbox.
- **Virus scanning** for uploads (paid; needed before public launch).
- **Lawyer** covering Ghana and UK/EU data protection. The brief is in `docs/legal-review.md`.
- **Mailbox for support@floortest.fm**, to replace info@imullar.com.
