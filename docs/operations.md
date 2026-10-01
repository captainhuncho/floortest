# FloorTest operations

How the backend works, how to run it, and what to do when something goes wrong. Keep this current when you change any of it.

## The pieces

| Piece | Service | What it holds |
|---|---|---|
| App (pages, API, admin) | Vercel, project `floortest`, region London (`lhr1`) | Next.js 16 app. Every push to `main` deploys to production; other branches get previews behind Vercel login |
| Database | Supabase Postgres (pooled connection) | Accounts, tracks, senders, events, admin records. Preview uses its own database |
| Audio and files | Cloudflare R2, bucket `floortest-audio` (preview: `floortest-audio-preview`) | Original WAV/MP3s, stems, cover photos, unfinished uploads, nightly backups under `backups/` |
| Email | Resend, from `hello@floortest.imullar.com` | Receipts, alerts, digests, invites, security emails |
| Bot check | Cloudflare Turnstile (hostname `floortest.imullar.com`) | Sign-up, waitlist, contact, anonymous uploads |
| Domain and DNS | imullar.com DNS host | `floortest.imullar.com` points at Vercel; SPF/DKIM for Resend; DMARC inherited from `imullar.com` (`p=none`) |

Uploads never pass through the app: the browser gets a short-lived signed URL and sends the file straight to R2, then the app checks the file is real audio before creating the track.

## Settings (Vercel environment variables)

Production and Preview have separate values. Never paste values into chats or tickets.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (use the pooled string) |
| `APP_SECRET` | Signs upload links, unsubscribe links and admin "view as". Production refuses to run without it |
| `APP_URL` | `https://floortest.imullar.com` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_DRIVER=s3` | R2 storage |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `SUPPORT_EMAIL` | Email |
| `ADMIN_EMAILS` | Who can open `/admin` (they also need a confirmed email and two-factor) |
| `CRON_SECRET` | Lets Vercel's scheduler call the nightly jobs |
| `SIGNUP_MODE` (`invite`/`open`), `BETA_INVITE_CODES` | Who can sign up |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Bot check |
| `DB_AUTO_MIGRATE=true`, `DB_POOL_MAX=5` | Database behaviour |

Code switches (in the repo, not Vercel): `SHARING_LIVE` and `STEMS_PLANS` in `src/lib/plans.ts`, `TURNSTILE_READY` in `src/lib/turnstile.ts`. Stems can also be switched per plan or account in **Admin → Feature switches**.

## Releasing

1. Work on branch `mobile-next`. Every push builds a preview.
2. Check: `npm run typecheck`, `npm test`, and `npx next build` all pass. The preview build must say Ready in Vercel.
3. Ship: fast-forward `main` to `mobile-next` and push. Production deploys in about 1–2 minutes.
4. After shipping, check `https://floortest.imullar.com/api/health` returns `{"ok":true}`. In Vercel, check that runtime logs show no 5xx.
5. Rolling back: in Vercel → Deployments, promote the previous production deployment. It's instant, and database changes are additive, so old code still runs.

Database changes are numbered migrations in `src/lib/db/migrations.ts`. They run automatically the first time a new deployment touches the database. Only ever add new migrations; never edit old ones.

## Scheduled jobs (Vercel Cron)

| When (UTC) | Job | What it does |
|---|---|---|
| 03:30 daily | `/api/cron/purge` | **1. Backup first.** Writes the whole database to R2 `backups/db-YYYY-MM-DD.json.gz`. If the backup fails, the job stops: nothing is deleted that night, an incident is raised, and it returns 500. **2.** Sends 7-day deletion warnings. **3.** Deletes tracks past retention (unreviewed 90 days, "not for me" 30 days), abandoned uploads, expired sessions and rate-limit records. **4.** Finalises share consents left past their 2-minute window. **5.** Retries queued file deletions |
| 08:00 daily | `/api/cron/digest` | Receiver digests, 2-week nudges, and the Monday admin metrics email |

Normal page visits also run light cleanup (sessions, rate limits, abandoned uploads), at most every 10 minutes per server. Track retention only runs in the nightly job, after a good backup.

## Backups and restore

- **What's covered:** every table except short-lived ones (sessions, rate limits, pending uploads, password resets). Audio files are **not** in the database backup; they live in R2.
- **Kept** 14 days. Every backup is listed in `app_state.backup_keys`, so older ones are always deleted, even after missed nights.
- **Status:** Admin → Overview shows the last backup. It becomes a red to-do if none ran in 2 days.
- **Restore drill** (run after schema changes and monthly): download a backup from R2, then run `npx tsx scripts/restore-drill.ts path/to/db-YYYY-MM-DD.json.gz`. It rebuilds a throwaway database and checks every table's row count. It never touches production.
- **A real restore:** restore into a *new* Supabase database first, check it, then point `DATABASE_URL` at it and redeploy. Never overwrite production in place.
- **Gaps (to do):** a separate bucket and credentials for backups, recovery copies of audio (R2 versioning or replication), and Supabase point-in-time recovery (paid).

## Deleting things (privacy, retention, admin)

All file deletion goes through one queue (`storage_deletions`, `src/lib/deletion.ts`):

1. Every file involved (audio, stems, cover, unfinished uploads) is added to the queue **in the same transaction** that removes the database rows.
2. The files are then deleted immediately. A failure stays queued, with the error and attempt count.
3. The nightly job retries. After 5 failed tries, an incident is raised.

So a storage outage can delay a deletion but can never lose track of a file. Account deletion, sender erasure, receiver deletes, admin removals, takedowns and retention all use it.

## Monitoring

- **Admin → Overview:** the to-do list (takedowns, privacy requests, appeals, failed emails, incidents, missing backups) and this week vs last.
- **Admin → Incidents:** server errors, failed uploads, failed emails, cron failures, bot-check problems and stuck deletions. **5 or more incidents in an hour email the admins**, at most once an hour.
- **Vercel → Logs / Observability:** raw runtime errors.
- **Health check:** `/api/health` (database). With the cron secret, it also checks storage and configuration.
- **To add:** an external uptime monitor on `/` and `/api/health`.

## Security

- **Admin:** listed email, confirmed email and two-factor are all required, and every admin action is logged (**Admin → Admin log**). Two-factor resets need the user's handle typed in, plus a note on how you confirmed it's them.
- **Abuse:** rate limits per connection and per email address on uploads, logins, contact and waitlist; Turnstile on public forms; IP addresses are kept at most 48 hours.
- **Blocking abusers:** per receiver, by the receiver; platform-wide by email address or domain in **Admin → Sender blocks**.
- **Uploads:** checked by file content (RIFF/MPEG structure, no trailing payloads), not by name. There's no antivirus scan yet, a known beta limitation.

## When something goes wrong

| Symptom | Check | Fix |
|---|---|---|
| Site down / 5xx | Vercel deployment state and logs; `/api/health` | Promote the previous deployment. If the database is the cause, check Supabase status and connections |
| "Something went wrong" on one page | Admin → Incidents (the code on the error page matches the log digest) | Fix forward, or roll back |
| Nobody can sign up or send | Admin → Incidents for "Bot check"; Cloudflare Turnstile widget hostnames | Set `TURNSTILE_READY = false` and ship to pause the check |
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
