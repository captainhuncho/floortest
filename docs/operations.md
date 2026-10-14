; Vercel → Firewall → Traffic for 403s from the rate rules# FloorTest operations

How the backend works, how to run it, and what to do when something goes wrong. Keep this current when you change any of it.

## The pieces

| Piece | Service | What it holds |
|---|---|---|
| App (pages, API, admin) | Vercel, project `floortest`, region London (`lhr1`) | Next.js 16 app. Every push to `main` deploys to production; other branches get previews behind Vercel login |
| Database | Neon Postgres, London (pooled connection) | Accounts, tracks, senders, events, admin records. Preview uses its own database |
| Audio and files | Cloudflare R2, bucket `floortest-audio-eu`, Western Europe, since 11 Oct (preview: `floortest-audio-preview`; the old `floortest-audio` was emptied and deleted on 14 Oct) | Original WAV/MP3s, stems, cover photos, unfinished uploads, nightly backups under `backups/` |
| Email | Resend, from `team@floortest.app`; replies land there because `MAIL_REPLY_TO` is left unset (a misspelt value sent replies to a domain we don't own, 13 Oct; set it only to send replies elsewhere) | Receipts, alerts, digests, invites, security emails |
| Bot check | Cloudflare Turnstile (hostnames `floortest.app`, plus the old `floortest.imullar.com`) | Sign-up, waitlist, contact, anonymous uploads |
| Domain and DNS | Hosting.com (cPanel) | `floortest.app` points at Vercel (A `216.198.79.1` + `64.29.17.1`; `www`/`ops` CNAME); Resend SPF/DKIM on `send` / `resend._domainkey`; Google Workspace MX `1 smtp.google.com`, SPF on the root includes `_spf.google.com`; DMARC `p=none` on `_dmarc.floortest.app`. Old `floortest.imullar.com` redirects to `floortest.app` |

Uploads never pass through the app: the browser gets a short-lived signed URL and sends the file straight to R2, then the app checks the file is real audio before creating the track.

## Settings (Vercel environment variables)

Production and Preview have separate values. Never paste values into chats or tickets.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (use the pooled string) |
| `APP_SECRET` | Signs upload links, unsubscribe links and admin "view as". Production refuses to run without it |
| `APP_URL` | `https://floortest.app` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_DRIVER=s3` | R2 storage |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `SUPPORT_EMAIL` | Email |
| `ADMIN_EMAILS` | Who can open `/admin` (they also need a confirmed email and two-factor) |
| `CRON_SECRET` | Lets Vercel's scheduler call the nightly jobs |
| `BETA_INVITE_CODES` | Extra shared invite codes (sign-up itself is a switch, below) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Bot check (on/off is a switch, below) |
| `STAGING_EMAIL_TO` (previews only) | On staging, every email goes to this address instead of the real person. Unset means nothing is sent |
| `BACKUP_KEY` (required) | Encrypts nightly backups. **Keep a copy outside Vercel and the bucket:** without it, backups can't be read |
| `SCAN_URL`, `SCAN_SECRET` | The virus scanner (`scanner/`, our own ClamAV on Cloudflare Containers; Fly.io is only a written-down fallback). Set `SCAN_SECRET` before `SCAN_URL`, and redeploy once both are in. Set = every track and stem upload is checked before it exists; fails closed if the scanner can't be reached. Unset = off |
| `BACKUP_BUCKET`, `BACKUP_ACCESS_KEY_ID`, `BACKUP_SECRET_ACCESS_KEY` | The recovery copy ("vault"): a second private R2 bucket on the same account. The key needs write on that bucket and read on `S3_BUCKET`. Unset = off |
| `ALERT_WEBHOOK_URL` (optional) | A Discord or Slack incoming-webhook URL. Urgent alerts go there as well as email, so you still hear about it if email itself is down |
| `DB_AUTO_MIGRATE=true`, `DB_POOL_MAX=5` | Database behaviour |

**Switches (Admin → Feature switches, no deploy):** sharing with colleagues, bot check, open sign-up, and pause all uploads (maintenance). Stems is switched per plan or per account on the same page. Every flip is logged.

## Releasing

1. Work on branch `mobile-next`. Every push builds a preview.
2. Check: `npm run typecheck`, `npm test`, and `npx next build` all pass. The preview build must say Ready in Vercel.
3. Ship: fast-forward `main` to `mobile-next` and push. Production deploys in about 1–2 minutes.
4. After shipping, check `https://floortest.app/api/health` returns `{"ok":true}`. In Vercel, check that runtime logs show no 5xx.
5. Rolling back: in Vercel → Deployments, promote the previous production deployment. It's instant, and database changes are additive, so old code still runs.

Database changes are numbered migrations in `src/lib/db/migrations.ts`. They run automatically the first time a new deployment touches the database. Only ever add new migrations; never edit old ones.

## Scheduled jobs (Vercel Cron)

| When (UTC) | Job | What it does |
|---|---|---|
| 03:30 daily | `/api/cron/purge` | **1. Backup first.** Writes the whole database to R2 `backups/db-YYYY-MM-DD.json.gz`. If the backup fails, the job stops: nothing is deleted that night, an incident is raised, and it returns 500. **2.** Sends 7-day deletion warnings. **3.** Deletes tracks past retention (unreviewed 90 days, "not for me" 30 days), abandoned uploads, expired sessions and rate-limit records. **4.** Finalises share consents left past their 2-minute window. **5.** Retries queued file deletions |
| 08:00 daily | `/api/cron/digest` | Receiver digests, 2-week nudges, and the Monday admin metrics email |

The email jobs mark each track before sending and give it back if the send fails, so a crash or a rerun can't send the same email twice, and a failed email is retried on the next run. One receiver's failed digest never stops the others.

Normal page visits also run light cleanup (sessions, rate limits, abandoned uploads), at most every 10 minutes per server. Track retention only runs in the nightly job, after a good backup.

## Backups and restore

- **What's covered:** every table except short-lived ones: every kind of sign-in session and one-time code (account, ops, share-link listeners, view-as, password resets, sign-in and email codes), rate limits (the only place IP addresses are kept, besides pending uploads), pending uploads and speed timings. A backup holds no live way in, and a restore brings no session back. Live email-confirmation tokens and email bodies are blanked. Audio files are **not** in the database backup; they live in R2.
- **Encrypted** (AES-256-GCM) with `BACKUP_KEY`. Rotating it makes older backups unreadable unless you keep the old key. Each run gets its own file (`db-YYYY-MM-DDTHHMM.json.gz.enc`), so a manual rerun never replaces the night's backup.
- **Kept** 14 days. Every backup is listed in `app_state.backup_keys`, so older ones are always deleted, even after missed nights.
- **Status:** Admin → Overview shows the last backup. It becomes a red to-do if none ran in 2 days.
- **Restore drill** (run after schema changes and monthly; with the vault on, use a backup from the vault bucket and spot-check that a few audio files are in it too): download a backup from R2, then run `BACKUP_KEY=… npx tsx scripts/restore-drill.ts path/to/db-….json.gz.enc` (use the same key as the server). It rebuilds a throwaway database and checks every table's row count. It never touches production.
- **A real restore:** restore into a *new* Neon database (or branch) first, check it, then point `DATABASE_URL` at it and redeploy. Never overwrite production in place.
- **Recovery copy (the vault, `src/lib/vault.ts`):** with `BACKUP_*` set, backups are written to the vault bucket (listed in `app_state.vault_backup_keys`, kept 14 days; older ones in the main bucket age out there), and every night after the backup each stored file not yet copied (audio, stems, artwork, covers, site images) is copied into it server-side, checked for size and recorded in `vault_copies`. A file deleted from storage is deleted from the vault too, through the deletion queue. Status: Admin → Storage & costs → Recovery copy. A restore from the vault: copy the files back with `scripts/copy-bucket.ts` (vault → main). The vault's `backups/` prefix carries an R2 bucket lock (`backups-14-days`, set 13 Oct): a backup can't be deleted or overwritten for 14 days by any key, so a leaked vault key can't wipe recent backups; the nightly age-out deletes only older ones. One effect: a second backup written in the same minute as another (same key) is refused, so wait a minute before pressing Back up now again.
- **Gaps (to do):** Neon point-in-time recovery beyond the free window (Neon Launch).

## Deleting things (privacy, retention, admin)

All file deletion goes through one queue (`storage_deletions`, `src/lib/deletion.ts`):

1. Every file involved (audio, stems, cover, unfinished uploads) is added to the queue **in the same transaction** that removes the database rows.
2. The files are then deleted immediately. A failure stays queued, with the error and attempt count.
3. The nightly job retries. After 5 failed tries, an incident is raised.

So a storage outage can delay a deletion but can never lose track of a file. With the recovery copy on, the same queue deletes the vault's copy (a key stays queued until both are gone). Account deletion, sender erasure, receiver deletes, admin removals, takedowns and retention all use it. Files that are simply replaced or refused (a new profile cover or collection artwork, refused track artwork, a failed or discarded upload, the original of a sealed upload) go through `discardFiles()`: queued, deleted at once, retried if that fails. Nothing deletes from storage directly.

## Monitoring

- **Admin → Overview:** the to-do list (takedowns, privacy requests, appeals, failed emails, incidents, missing backups) and this week vs last.
- **Admin → Incidents:** server errors, failed uploads, failed emails, cron failures, bot-check problems and stuck deletions. Open incidents stay on the Overview until you **mark them handled**, one by one or all at once. "Upload refused" entries record why a visitor's file was turned away; they're for reference and never alert.
- **Alerts:** a failed nightly job or a stuck file deletion alerts the admins **straight away** (at most every 15 minutes). Anything else alerts when there are 5 or more incidents in an hour (at most once an hour). Alerts go by email, and to `ALERT_WEBHOOK_URL` when it's set.
- **Overview → Configuration:** when the nightly cleanup and morning emails last ran (ok or failed, and how long they took), the last backup, and how many files are waiting to be deleted.
- **Vercel → Logs / Observability:** raw runtime errors.
- **Health check:** `/api/health` (database). With the cron secret, it also checks storage and configuration.
- **To add:** an external uptime monitor on `/` and `/api/health`.

## Security

- **Vercel Firewall (edge, before the app runs):** set up 2026-10-03 in Vercel → floortest → Firewall → Rules.
  - **Block common attack paths:** WordPress, `.env`, `.git`, phpMyAdmin, xmlrpc, cgi-bin and `.php` requests get a 403.
  - **Rate limit authentication endpoints:** POSTs to `/login`, `/login/code`, `/login/code/enter`, `/signup` and `/forgot` above 20 a minute per IP get a 403. Hobby allows only one rate-limit rule.
  - **Bot Protection:** in **Log** mode. Check Firewall → Traffic for a few days, and switch to Challenge only if no real senders appear in it.
  - **Not available on Hobby:** an upload rate-limit rule (needs Pro; the app's own upload limits still apply) and the OWASP ruleset (Enterprise).

- **Admin:** listed email, confirmed email and two-factor are all required, and every admin action is logged (**Admin → Admin log**). Two-factor resets need the user's handle typed in, plus a note on how you confirmed it's them.
- **Abuse:** rate limits per connection and per email address on uploads, logins, contact and waitlist; Turnstile on public forms; IP addresses are kept at most 48 hours. Above the app, the Vercel Firewall (Pro) denies an address with 403 for the rest of the minute after 300 requests to `/api/*` or 60 to the sign-in pages in a minute (rules "API ceiling" and "Sign-in pages", Vercel → floortest → Firewall; hits show under Firewall → Traffic).
- **Blocking abusers:** per receiver, by the receiver; platform-wide by email address or domain in **Admin → Sender blocks**.
- **Uploads:** checked by file content (RIFF/MPEG structure, no trailing payloads), not by name. Every track and stem is then scanned by our own ClamAV service (`scanner/`, `src/lib/scan.ts`; live since 14 Oct): a flagged file is refused and discarded; if the scanner can't be reached the upload is refused with "try again" and the browser retries for about 30 s. Preview uploads aren't scanned.

## When something goes wrong

| Symptom | Check | Fix |
|---|---|---|
| Site down / 5xx | Vercel deployment state and logs; `/api/health` | Promote the previous deployment. If the database is the cause, check Neon status and connections |
| "Something went wrong" on one page | Admin → Incidents (the code on the error page matches the log digest) | Fix forward, or roll back |
| Nobody can sign up or send | Admin → Incidents for "Bot check"; Cloudflare Turnstile widget hostnames | Admin → Feature switches → turn off **Bot check** (instant) |
| Emails not arriving | Admin → Emails sent (status column), Resend dashboard | Check domain verification and API key; resend from admin |
| Backup missing (red on Overview) | Admin → Incidents "Nightly database backup failed"; R2 credentials | Fix and rerun: in Vercel → Cron Jobs, run `/api/cron/purge` |
| Storage errors | Incidents "could not be deleted" / upload failures; Cloudflare R2 status | Queued deletions retry automatically once R2 is back |
| Leaked admin access | Admin log | Remove the address from `ADMIN_EMAILS`, sign that account out everywhere, then rotate `APP_SECRET` |

## Rotating secrets

- **`APP_SECRET`:** breaks every unsubscribe link already sent, any upload in progress, and admin "view as" sessions. Do it deliberately, then redeploy. Use a fresh random value of 32+ characters. Keep Production and Preview different.
- **R2, Resend, Turnstile and database keys:** create the new key, update Vercel, redeploy, check health, then revoke the old key.
- **`CRON_SECRET`:** update it in Vercel and redeploy; Vercel's scheduler picks it up.

## Test scripts

- `npm test`: unit tests, including consent races and the deletion queue.
- `npx tsx scripts/smoke.ts <url> <handle>`: a real upload end to end, plus a disguised file being refused. It creates a real track, so delete it afterwards.
- `npx tsx scripts/stress.ts <url> <handle>`: concurrency, hostile input, rate limits and auth. **Local or throwaway deployments only, never the live site.**
- `npx tsx scripts/restore-drill.ts <backup.json.gz>`: proves a backup restores.
- `R2_ACCOUNT=… npx tsx scripts/copy-bucket.ts <from> <to> [--dry-run]`: copies every file between two R2 buckets inside Cloudflare (asks for the key, hidden), skips files already there at the same size, never deletes, checks sizes at the end. Used for the bucket move.
