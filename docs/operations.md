# FloorTest operations

How the backend works, how to run it, and what to do when something goes wrong. Keep this current when you change any of it.

## The pieces

| Piece | Service | What it holds |
|---|---|---|
| App (pages, API, admin) | Vercel, project `floortest`, region London (`lhr1`) | Next.js 16 app. Every push to `main` deploys to production; other branches get previews behind Vercel login |
| Database | Neon Postgres, London (pooled connection) | Accounts, tracks, senders, events, admin records. Preview uses its own database |
| Audio and files | Cloudflare R2, bucket `floortest-audio-eu`, Western Europe, since 11 Oct (preview: `floortest-audio-preview`; the old `floortest-audio` was emptied and deleted on 14 Oct) | Original WAV/MP3s, stems, cover photos, unfinished uploads, nightly backups under `backups/` |
| Email | Resend, from `team@floortest.app`; replies land there because `MAIL_REPLY_TO` is left unset (a misspelt value sent replies to a domain we don't own, 13 Oct; set it only to send replies elsewhere) | Receipts, alerts, digests, invites, security emails |
| Bot check | Cloudflare Turnstile, widget "floor test", managed mode, hostnames `floortest.app` and `ops.floortest.app` only (checked 16 Oct). Previews have no Turnstile keys, so the check is off there | Sign-up, log-in after wrong tries, waitlist, contact, newsletter, sender link, anonymous uploads, reopen alerts |
| Domain and DNS | Hosting.com (cPanel) | `floortest.app` points at Vercel (A `216.198.79.1` + `64.29.17.1`; `www`/`ops` CNAME); Resend SPF/DKIM on `send` / `resend._domainkey`; Google Workspace MX `1 smtp.google.com`, SPF on the root includes `_spf.google.com`; DMARC `p=none` on `_dmarc.floortest.app`. Old `floortest.imullar.com` redirects to `floortest.app` |

Uploads never pass through the app: the browser gets a short-lived signed URL and sends the file straight to R2, then the app checks the file is real audio before creating the track.

## Settings (Vercel environment variables)

Production and Preview have separate values. Never paste values into chats or tickets.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (use the pooled string) |
| `APP_SECRET` | Signs upload links, unsubscribe links, offline links, the app's access tokens and admin "view as"; seals two-step secrets and queued emails; keys recovery codes, passkey user handles and the Security page's device ids. Production refuses to run without it |
| `APP_URL` | `https://floortest.app` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_DRIVER=s3` | R2 storage |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `SUPPORT_EMAIL` | Email |
| `ADMIN_EMAILS` | Who can open `/admin` (they also need a confirmed email and two-factor) |
| `CRON_SECRET` | Lets Vercel's scheduler call the nightly jobs |
| `BETA_INVITE_CODES` | Extra shared invite codes (sign-up itself is a switch, below) |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Bot check (on/off is a switch, below) |
| `STAGING_EMAIL_TO` (previews only) | On staging, every email goes to this address instead of the real person. Unset means nothing is sent |
| `BACKUP_KEY` (required) | Encrypts nightly backups. **Keep a copy outside Vercel and the bucket:** without it, backups can't be read. Make it with `openssl rand -hex 32`, never a passphrase: it's used through one SHA-256 with no stretching (`src/lib/backup-crypto.ts`) |
| `SCAN_URL`, `SCAN_SECRET` | The virus scanner (`scanner/`, our own ClamAV on Cloudflare Containers; Fly.io is only a written-down fallback). Set `SCAN_SECRET` before `SCAN_URL`, and redeploy once both are in. Set = every track and stem upload is checked before it exists; fails closed if the scanner can't be reached. Unset = off |
| `BACKUP_BUCKET`, `BACKUP_ACCESS_KEY_ID`, `BACKUP_SECRET_ACCESS_KEY` | The recovery copy ("vault"): a second private R2 bucket on the same account. The key needs write on that bucket and read on `S3_BUCKET`. Unset = off |
| `ALERT_WEBHOOK_URL` (optional) | A Discord or Slack incoming-webhook URL. Urgent alerts go there as well as email, so you still hear about it if email itself is down |
| `DB_AUTO_MIGRATE=false`, `DB_POOL_MAX=2` | Database behaviour, as set on Production and Preview (checked 31 Oct): migrations run in `vercel-build`, not when a function starts; each function instance opens at most two connections. The code's defaults (on, 5) are for local runs |

**Switches (Admin → Feature switches, no deploy):** sharing with colleagues, bot check, open sign-up, account teams, and pause all uploads (maintenance). Beta scope (owner, 15 Oct; all off until switched on as weekly reveals): **More than two collections** (`more_collections`), **Send music between desks** (`send_music`), **Referrals page** (`referrals`), **Plan requests** (`plan_requests`). With **Account teams** off, teams still work on a desk owned by an ops super admin (ADMIN_EMAILS), so the owner can test them. Stems is switched per plan or per account on the same page. Every flip is logged.

**Who sees it (targeted switches, branch `targeted-switches`, 27 Oct; not on preview or live yet):** the account switches (**Account teams**, **More than two collections**, **Send music between desks**, **Referrals page**, **Plan requests**) can carry a rule under **Who sees it** on the same page: named accounts (handles), account types, plans, countries (two-letter codes, from Vercel's `x-vercel-ip-country` on each request) and a percentage. Named accounts always get it; every other part that is set must match, then the percentage takes a stable slice (a hash of the switch name and the account id, so the same account always gets the same answer, and raising the percentage only adds people). Off is off for everyone; on with no rule is everyone; desks owned by an ops super admin (ADMIN_EMAILS) always pass a rule, so the owner can test. The page shows who a rule covers (accounts out of all, country counted per visit); setting and clearing a rule are logged like flips. The other switches (sharing, bot check, open sign-up, paid plans, pause uploads) act on visitors without an account, on legal wording or on money, so they stay plain on/off. Checked on the server in one place (`switchOn` in `src/lib/switches.ts`); targeting uses only the account, its type, its plan and the request's country, never age, gender, ethnicity, health or religion, and no third-party flag service. **Rolling back** to a build without rules (before migration 0104's code): first turn off any switch that has a rule, because older code ignores the rule and would show the feature to everyone.

## Releasing

1. Work on branch `mobile-next`. Every push builds a preview.
2. Check: `npm run typecheck`, `npm test`, and `npx next build` all pass. The preview build must say Ready in Vercel.
3. Ship: merge the release pull request into `main` on GitHub (never push `main`; steps in the `owner-ship` skill). Production deploys in about 1–2 minutes.
4. After shipping, check `https://floortest.app/api/health` returns `{"ok":true}`. In Vercel, check that runtime logs show no 5xx.
5. Rolling back: in Vercel → Deployments, promote the previous production deployment. It's instant, and database changes are additive, so old code still runs.

Database changes are numbered migrations in `src/lib/db/migrations.ts`. They run automatically the first time a new deployment touches the database. Only ever add new migrations; never edit old ones.

## Scheduled jobs (Vercel Cron)

| When (UTC) | Job | What it does |
|---|---|---|
| 03:30 daily | `/api/cron/purge` | **1. Backup first.** Writes the whole database to R2 `backups/db-YYYY-MM-DD.json.gz`. If the backup fails, the job stops: nothing is deleted that night, an incident is raised, and it returns 500. **2.** Sends 7-day deletion warnings. **3.** Deletes tracks past retention (unreviewed 90 days, "not for me" 30 days), abandoned uploads, expired sessions and rate-limit records, and queues cover photos, collection artwork and site images that nothing points to a week after upload (`file_reservations`); after the recovery copy, fingerprints new files and re-checks old ones for 60 seconds (`file_digests`; a changed or missing file is held back and raises an urgent incident); sends emails still waiting in the outbox. **4.** Finalises share consents left past their 2-minute window. **5.** Retries queued file deletions |
| 08:00 daily | `/api/cron/digest` | Receiver digests, 2-week nudges, first-track nudges, Played out reminders, and the Monday admin metrics email (counted as sent only when every admin's copy went through; a failed copy is retried on the next daily run, to that admin only, for up to 6 days). Each step runs on its own: one that fails raises a `cron_failed` incident naming it, the others still run, and the run is recorded as failed (500) |
| Every 10 minutes (:05, :15, …) | `/api/cron/mail` | Sends the email queue (`outbox`): the digests and reminders the daily job queued, retries of failed sends (after 1, 5, 15 and 60 minutes), and sends a crash interrupted. Up to 100 a run, none started after 240 s. Admin → Jobs "Email queue" shows runs that sent something; it's reported late after an hour |
| Every 5 minutes | `/api/cron/scan-held` | Held uploads virus check (below) |

**How email is sent (28 Oct, Batch B):** every email is written to the outbox before it goes, with its own Resend idempotency key. The scheduled emails (digests, nudges, reminders, expiry warnings) and the instant new-track email are queued in the same transaction that marks their tracks as emailed: the email exists exactly when the mark does, so a crash or a rerun can't send it twice. Only the queue retries, always with the same key, so a Resend timeout is never sent as a second email. A queued email that can't be read (sealed with an old `APP_SECRET`) is closed as `failed (unreadable)`; one stuck mid-send after all 5 attempts is closed as `failed (stuck)`; both raise an `email_failed` incident and never block the rest. Sign-in codes still go out in one attempt during the request.

**Daily send limit:** Resend's free plan stops at 100 emails a day (`MAIL_DAILY_LIMIT`, default 100). Once 80% of it is used, optional emails (digests, nudges, alerts: the ones with an unsubscribe link) wait in the queue until just after midnight UTC, so sign-in codes, resets and senders' receipts still go. The first deferral each day raises one `email_failed` incident ("Optional emails are waiting until tomorrow"). Set `MAIL_DAILY_LIMIT` in Vercel after upgrading the Resend plan.

To send the queue by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://floortest.app/api/cron/mail`.

Normal page visits also run light cleanup (sessions, rate limits, abandoned uploads, emails waiting to be retried), at most every 10 minutes per server. Track retention only runs in the nightly job, after a good backup.

## Backups and restore

- **What's covered:** every table except short-lived ones: every kind of sign-in session and one-time code (account, ops, share-link listeners, view-as, password resets, sign-in and email codes), rate limits (the only place IP addresses are kept, besides pending uploads), pending uploads and speed timings. A backup holds no live way in, and a restore brings no session back. Live email-confirmation tokens and email bodies are blanked. Audio files are **not** in the database backup; they live in R2.
- **One moment:** every table is read in one read-only, repeatable-read transaction, so a backup never holds a track without its sender (tables were read one by one until 28 Oct, Batch C).
- **Encrypted** (AES-256-GCM) with `BACKUP_KEY`. Each backup names the key that sealed it (a short fingerprint, not the key). To change the key: set the new `BACKUP_KEY`, put the old one in `BACKUP_OLD_KEYS` (comma-separated) and in the password manager, and remove it after 14 days, when the last backup made with it has gone; a restore picks the right key and says which one is missing. Each run gets its own file (`db-YYYY-MM-DDTHHMM.json.gz.enc`), so a manual rerun never replaces the night's backup.
- **Kept** 14 days. Every backup is listed in `app_state.backup_keys`, so older ones are always deleted, even after missed nights.
- **Status:** Admin → Overview shows the last backup. It becomes a red to-do if none ran in 2 days.
- **Restore drill** (run after schema changes and monthly; with the vault on, use a backup from the vault bucket and spot-check that a few audio files are in it too): download a backup from R2, then run `BACKUP_KEY=… npx tsx scripts/restore-drill.ts path/to/db-….json.gz.enc` (use the same key as the server). It rebuilds a throwaway database and checks every table's row count. It never touches production. Last drill: 29 Oct 2026, nightly vault backup `db-2026-10-29T0330`, 49 of 49 tables clean, 551 rows ([evidence](evidence/2026-10-29-restore-drill.md)); next due by 28 Nov.
- **A real restore:** restore into a *new* Neon database (or branch) first, check it, then point `DATABASE_URL` at it and redeploy. Never overwrite production in place. A restore takes the database back to the backup's moment (call it T), so deletions and sign-outs made after T come undone. Follow the steps below.
- **Recovery copy (the vault, `src/lib/vault.ts`):** with `BACKUP_*` set, backups are written to the vault bucket (listed in `app_state.vault_backup_keys`, kept 14 days; older ones in the main bucket age out there), and every night after the backup each stored file not yet copied (audio, stems, artwork, covers, site images) is copied into it server-side, checked for size and recorded in `vault_copies`. A file deleted from storage is deleted from the vault too, through the deletion queue. Status: Admin → Storage & costs → Recovery copy. A restore from the vault: copy the files back with `scripts/copy-bucket.ts` (vault → main). The vault's `backups/` prefix carries an R2 bucket lock (`backups-14-days`, set 13 Oct): a backup can't be deleted or overwritten for 14 days by any key, so a leaked vault key can't wipe recent backups; the nightly age-out deletes only older ones. One effect: a second backup written in the same minute as another (same key) is refused, so wait a minute before pressing Back up now again.
- **Point-in-time recovery:** the free plan keeps a short restore window; Neon Launch (owner, before public launch) raises it to 7 days. To rewind: Neon → Branches → Restore → the production branch at the moment before the damage; check the new branch (row counts, a few tracks), then set `DATABASE_URL` in Vercel to it and redeploy. Production is never restored in place. Files are separate: the vault holds their copies.

### Production restore, step by step

From the restore and deletion code (`src/lib/backup.ts`, `src/lib/privacy.ts`, `src/lib/deletion-core.ts`, `src/lib/mail.ts`). T is the moment of the backup or the point-in-time branch.

1. **Pause uploads:** Admin → Feature switches → pause all uploads (`uploads_paused`). The switch is restored to its state at T, so set it again on the new database before going live.
2. **Write down what happened after T**, from the current production database if it can still be read:
   - accounts deleted since T: `released_handles` rows with `released_at` after T (every deleted account's link names go there; `purgeAccount`);
   - privacy erasures since T: Admin log lines "deleted account (privacy request)", "erased sender (privacy request)" and "deleted invite". The log shortens the email, so take the full address from the request itself;
   - files still waiting to be deleted: every `storage_deletions` row (`file_key`, `reason`).
3. **Load the copy into a new database.** A Neon point-in-time branch needs nothing more. From a nightly backup file: **Gap**, no script loads a backup into real Postgres; `scripts/restore-drill.ts` loads only into an in-memory database. Its steps are the model (run the migrations, `SET session_replication_role = replica`, insert every table, set it back), plus resetting each id sequence as `scripts/copy-to-neon.ts` does. Write and test that script before it's needed.
4. **End every sign-in on the new database.** A backup file holds no sign-in tables (`SKIP` in `src/lib/backup.ts`). A point-in-time branch does, including sessions that were ended after T, so empty them: `sessions`, `admin_sessions`, `link_sessions`, `view_tickets`, `password_resets`, `login_codes`, `sender_codes`, `link_codes`, `passkey_challenges`, `app_refresh_spent`, `two_step_tickets`. Everyone signs in again, the phone app included.
5. **Reapply the deletions from step 2** on the new database: delete each account again from Ops (super admin; `adminDeleteAccount` runs `purgeAccount`, which queues its files and reserves its link names), erase each sender again, delete each invite again, and put the waiting file keys back: `INSERT INTO storage_deletions (file_key, reason, created_at) VALUES (…) ON CONFLICT (file_key) DO NOTHING`. The nightly purge deletes them.
6. **Check the email queue before the mail job runs.** Rows queued at T come back `queued` with their sealed payload, and `/api/cron/mail` sends any `queued` row that is due. One already sent after T may go again (Resend's idempotency key doesn't last that long; not checked in code). Look at `SELECT id, subject, created_at FROM outbox WHERE status IN ('queued', 'sending')` and decide for each.
7. **Switch over:** set `DATABASE_URL` in Vercel to the new database and redeploy (migrations run in `vercel-build`). Check `/api/health` with the cron secret.
8. **After going live:**
   - Tracks a receiver deleted after T are back with no file (the vault copy went through the same queue). The nightly fingerprint check holds each missing file back and raises an urgent incident; delete those tracks again. Retention deletes old ones by itself. Copy files back from the vault (`scripts/copy-bucket.ts`) only for files that are still there.
   - Password, email, two-step and passkey changes made after T are undone. The code can't redo them: tell the people concerned (the old database's `account_log` lists what changed).
   - Backups written after T aren't in the restored `app_state` lists (`backup_keys`, `vault_backup_keys`), so the nightly age-out won't delete them. Delete them by hand once their 14-day bucket lock ends.
   - Turn uploads back on.

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
- **Scheduled jobs never overlap:** each job takes a lease (`lease_<job>` in `app_state`, 6 minutes) before it runs; a second call while one runs answers `{"skipped":"already running"}` and records nothing. A crashed run frees its lease after 6 minutes.
- **Webhooks act once:** each Resend delivery report is recorded by its `svix-id` in `webhook_receipts` in the same transaction as its changes; a retried or replayed report answers `{"duplicate":true}` and changes nothing (kept 30 days).
- **Health check:** `/api/health` is liveness: `{"ok":true}` when the database answers (the uptime checks use it). With the cron secret (`Authorization: Bearer $CRON_SECRET`) it is readiness: it also checks storage (a real storage error such as wrong keys or a wrong bucket, never just a missing file), the virus scanner (`checks.scanner`: ok, asleep, down or off; asleep is the scanner stopped after 10 idle minutes, read from its `/status` without waking it, and isn't a fault), the scheduled jobs (`checks.jobs`: failed, late, or never run a day after install) and configuration (email, `BACKUP_KEY`, a half-set recovery copy, the scanner), and answers 503 with `ok:false` while anything would break production. On the live site uploads are refused while the scanner is missing or down (never accepted unscanned); each refusal shows as "Virus check unavailable" in Ops → Incidents.
- **Uptime:** `.github/workflows/uptime.yml` checks `/` and `/api/health` every 30 minutes; a failed run emails the repository owner. With the `CRON_SECRET` repository secret set on GitHub (owner step: `gh secret set CRON_SECRET --repo captainhuncho/floortest`, value typed by the owner) it also runs the full health check, so a late or failed job, a storage fault or uploads stuck waiting for their virus check fail the run; without it that step is skipped with a notice. A paid external monitor (UptimeRobot) is on the launch list.

## Security

- **Vercel Firewall (edge, before the app runs):** set up 2026-10-03 in Vercel → floortest → Firewall → Rules.
  - **Block common attack paths:** WordPress, `.env`, `.git`, phpMyAdmin, xmlrpc, cgi-bin and `.php` requests get a 403.
  - **Rate limits:** since the Pro plan (14 Oct), the rules "API ceiling" and "Sign-in pages" (under Abuse below) replace the Hobby rule that allowed 20 sign-in POSTs a minute per IP.
  - **Bot Protection:** in **Log** mode. Check Firewall → Traffic for a few days, and switch to Challenge only if no real senders appear in it.
  - **Not available on Hobby:** an upload rate-limit rule (needs Pro; the app's own upload limits still apply) and the OWASP ruleset (Enterprise).

- **Admin:** listed email, confirmed email and two-factor are all required, and every admin action is logged (**Admin → Admin log**). Two-factor resets need the user's handle typed in, plus a note on how you confirmed it's them.
- **Abuse:** rate limits per connection and per email address on uploads, logins, contact and waitlist; Turnstile on public forms; IP addresses are kept at most 48 hours. Above the app, the Vercel Firewall (Pro) denies an address with 403 for the rest of the minute after 300 requests to `/api/*` or 60 to the sign-in pages in a minute (rules "API ceiling" and "Sign-in pages", Vercel → floortest → Firewall; hits show under Firewall → Traffic).
- **Signs in the account log (29 Oct):** `app_token_reused` means an app refresh token that had already been swapped came back, so it was copied; every app session of that sign-in has ended. Suggest the person changes their password. A wrong-password stop is per connection (20) and per email on one connection (10), so a stranger's tries don't lock the owner out; they see the human check instead.
- **Previews (owner checks, audit H39, H42, H57):** every deploy, previews included, runs the migrations, preview uploads aren't virus-scanned, and on previews ops lives on the preview host. All three are safe only while Preview has its own `DATABASE_URL` and `S3_*` and previews require Vercel sign-in. Check both in Vercel after any settings change.
- **Blocking abusers:** per receiver, by the receiver; platform-wide by email address or domain in **Admin → Sender blocks**.
- **Uploads:** checked by file content (RIFF/MPEG structure, no trailing payloads), not by name. Every track and stem is then scanned by our own ClamAV service (`scanner/`, `src/lib/scan.ts`; live since 14 Oct): a flagged file is refused and discarded; the scanner sleeps after 10 idle minutes (owner, 26 Oct). An upload finished while it's awake is scanned there and then (up to 45 s). One finished while it sleeps, or can't be reached, is **held** (hold and scan, branch `hold-and-scan`): stored, sealed, not on the desk, and the sender is told it's received and being checked. Every 10 minutes `/api/cron/scan-held` wakes the scanner once for all held uploads and finishes them: clean ones arrive and the sender gets the usual "Delivered" email; flagged or refused ones are deleted and the sender is emailed; any still held after 24 hours are deleted and the sender is told to send again. Stem uploads from a receipt are held the same way: the sender sees "Received, checking for viruses", and the batch attaches the stem (the receiver gets the usual "Stems are arriving" email) or emails the sender if it's refused. Preview uploads aren't scanned. **When a file is deleted (28 Oct, Batch A):** only when the upload is refused (wrong size, not audio, flagged, desk full or closed) or held past 24 hours. Any other failure while a track or stem is saved (a dropped database connection, a storage timeout) keeps the file and lets go of the claim, so the sender's retry or the next batch finishes it. An upload always points at a file that exists: it's moved to its sealed copy before the original is deleted. Each scan-held run plans for 260 s of its 300 s limit and starts no file with under 60 s left; the rest wait for the next run. A held upload that vanished without making a track is never counted as delivered: an `upload_failed` incident is raised and the sender is told to send again.
- **Held uploads:** `checks.held` in the detailed `/api/health` is how many are waiting; over an hour old is reported as a problem (503). Admin → Jobs shows "Held uploads virus check" runs that did something (empty runs only update its last-run time). To run it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://floortest.app/api/cron/scan-held`. Waiting uploads show in the `uploads` table with `held_at` set; `held_tries` counts batches that found the scanner down.
- **Scanner sleeping and waking:** `GET /status` on the scanner says `stopped` (asleep) or `running`/`healthy` without waking it; the half-hourly uptime check uses it. Once a day (06:17 UTC, and on a manual run) the uptime workflow wakes it with `/health` and checks ClamAV. `/health` needs the scanner's secret, like `/wake` and `/scan` (28 Oct: the repository is public, and an open `/health` let anyone keep the container awake and billed); the daily step uses the `SCAN_SECRET` repository secret and is skipped with a notice until the owner sets it (`tr -d '\n' < ~/floortest-scan-secret.txt | gh secret set SCAN_SECRET --repo captainhuncho/floortest`). To wake it by hand: `curl -H "Authorization: Bearer $(cat ~/floortest-scan-secret.txt)" https://floortest-scanner.maxwelladjavon.workers.dev/health` (up to about a minute). "Virus check unavailable" incidents that say `gave up waiting for the scanner to wake` mean a wake-up took over 150 s: check the Worker's logs in Cloudflare.

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

**After any incident users could see** (site down, lost or wrong data, emails to the wrong people, a security problem): write a short postmortem in `docs/evidence/YYYY-MM-DD-incident-<what>.md` within a week. Cover what happened and when (times in UTC), who was affected and for how long, how we found out, what fixed it, why it happened, and the one or two changes that stop it happening again, each added to `docs/06-plan.md`. Facts only: no blame, and no private links, tokens or personal data. Mark the incident handled in ops once it's written.

## Rotating secrets

- **`APP_SECRET`:** breaks every unsubscribe link already sent, any upload in progress, offline links, app access tokens (the app refreshes), queued emails (closed as `failed (unreadable)`) and admin "view as" sessions. It also seals every two-step secret and keys the recovery codes stored since 29 Oct, and nothing reads the old value: after a rotation, everyone with two-step on needs it reset by ops and set up again. (Passkey user handles are keyed with it too, but only when a passkey is added.) Do it only for a real leak, then redeploy. Use a fresh random value of 32+ characters. Keep Production and Preview different.
- **R2, Resend, Turnstile and database keys:** create the new key, update Vercel, redeploy, check health, then revoke the old key.
- **`CRON_SECRET`:** update it in Vercel and redeploy; Vercel's scheduler picks it up.

## Test scripts

- `npm test`: unit tests, including consent races and the deletion queue.
- `npx tsx scripts/smoke.ts <url> <handle>`: a real upload end to end, plus a disguised file being refused. It creates a real track, so delete it afterwards.
- `npx tsx scripts/stress.ts <url> <handle>`: concurrency, hostile input, rate limits and auth. **Local or throwaway deployments only, never the live site.**
- `npx tsx scripts/restore-drill.ts <backup.json.gz>`: proves a backup restores.
- `R2_ACCOUNT=… npx tsx scripts/copy-bucket.ts <from> <to> [--dry-run]`: copies every file between two R2 buckets inside Cloudflare (asks for the key, hidden), skips files already there at the same size, never deletes, checks sizes at the end. Used for the bucket move.
