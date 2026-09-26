# FloorTest

The receiving desk for unreleased music. A receiver (DJ, curator, label) shares one permanent link, hears incoming music fast, makes a quick decision and responds. A sender uploads an original file without an account and knows what happened next.

## Run it locally

```bash
npm install
npm run seed    # demo receiver with two callouts and six tracks (wipes ./data)
npm run dev
```

Open http://localhost:3000. The demo login is at the top of `scripts/seed.ts`; the demo receiver link is `/maxwell`.

No services to install: locally the app runs on an embedded Postgres (PGlite) and a folder for files, both under `./data`. Stop the dev server before running `npm run seed` (the embedded database is single-process). Node 22.5+.

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run seed` | Local demo data (refuses to run against a real database or bucket) |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm test` | Unit tests (ZIP writer, audio validation, policies, SQL placeholders) |
| `npm run smoke -- <url> <handle>` | End-to-end check of the public upload flow against any deployment |
| `npm run typecheck` | TypeScript |

## Architecture

Every backend is chosen by environment variables, so the same code runs on a laptop and in production.

| Piece | Local | Production | Code |
| --- | --- | --- | --- |
| Database | PGlite (embedded Postgres) | Any Postgres via `DATABASE_URL`: Supabase, Neon, RDS | `src/lib/db/` |
| Files (audio, covers) | `./data/storage` | Any S3-compatible bucket: Cloudflare R2, Supabase Storage, AWS S3 | `src/lib/storage.ts` |
| Email | Logged in-app | Resend (`RESEND_API_KEY`) | `src/lib/mail.ts` |
| Scheduled jobs | Call the URLs by hand | Vercel Cron (`vercel.json`) or any scheduler | `src/app/api/cron/` |

**Uploads never pass through the app server.** The sender's browser asks `/api/submit/<handle>` for permission (all intake rules run here), PUTs the file straight to storage with a signed URL, then calls `/api/submit/<handle>/complete`. The server checks the object's size and reads its first bytes to confirm it's real WAV/MP3 before creating the track; anything else is deleted. Playback redirects to short-lived signed URLs. Downloads and crate exports stream through the app so "Downloaded" is recorded only when the transfer completes.

Migrations live in `src/lib/db/migrations.ts` and run automatically on first request (guarded by a Postgres advisory lock), or explicitly with `npm run db:migrate`.

## Deploy for the beta

Recommended stack: **Vercel** (app + cron) · **Supabase** (Postgres) · **Cloudflare R2** (files, no egress fees for audio) · **Resend** (email). Each can be swapped for an equivalent.

1. **Database.** Create a Supabase project. Copy the *Transaction pooler* connection string (port 6543) into `DATABASE_URL`. Optionally run `DATABASE_URL=… npm run db:migrate` once from your machine.
2. **Storage.** Create an R2 bucket (private) and an API token with read/write on it. Set `S3_BUCKET`, `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Add this CORS policy to the bucket so browsers can upload and play directly:
   ```json
   [{ "AllowedOrigins": ["https://your-domain"], "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"], "ExposeHeaders": ["Content-Range", "Content-Length", "ETag"], "MaxAgeSeconds": 3600 }]
   ```
   Supabase Storage also works through its S3 endpoint (`https://<ref>.supabase.co/storage/v1/s3`, `S3_FORCE_PATH_STYLE=true`, region = project region).
3. **Email.** Verify your sending domain in Resend, then set `RESEND_API_KEY` and `MAIL_FROM`.
4. **App.** Import the repo into Vercel and set the variables from `.env.example`, at minimum `APP_URL`, `APP_SECRET` (`openssl rand -base64 48`), `CRON_SECRET`, `BETA_INVITE_CODES`. The cron jobs in `vercel.json` are picked up automatically. The digest job runs hourly, which needs a Vercel Pro plan; on Hobby (daily jobs only), call `/api/cron/digest` hourly from an external scheduler such as cron-job.org with the `Authorization: Bearer $CRON_SECRET` header.
5. **Verify.**
   - `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/health` should report `database: ok`, `storage: ok (s3)`, `email: resend` and an empty `problems` list.
   - Sign up with an invite code, then `npm run smoke -- https://your-domain <your-handle>`. Delete the smoke track afterwards.

Prefer a single server (Railway, Fly, Render, a VPS)? `npm run build && npm start` works as-is. Put `DATA_DIR` on a persistent volume if you skip `DATABASE_URL`/S3, back that volume up, and hit the two cron URLs from any scheduler.

## Beta launch checklist

- [ ] `/api/health` (with the cron secret) shows no problems
- [ ] Smoke test passes against production; test track deleted
- [ ] A real MP3 and a real WAV uploaded from a phone and a laptop, played and downloaded
- [ ] Password reset email arrives and works; delivery, listened and downloaded emails arrive
- [ ] Invite codes handed out; `SIGNUP_MODE=invite`
- [ ] `SUPPORT_EMAIL` set so the contact form reaches you
- [ ] Terms and Privacy reviewed (built-in pages are drafts), or `TERMS_URL` / `PRIVACY_URL` set
- [ ] Database backups on (Supabase does daily backups on paid plans; R2 objects persist)
- [ ] Uptime monitor on `/api/health`

## Product behaviour

### Receiver loop

1. Open **Submissions** (List or Queue layout).
2. Press play (Space).
3. **Keep** (K), **Could be better** (X) or **Reply** (R). Keep and Could be better move to the next track and keep playing.
4. Undo the last decision any time with U.
5. Kept tracks → **Prepare for set** downloads the originals with a `rekordbox.xml` and M3U8 playlist.

Navigation: The Floor (overview) · Submissions · Collections · Contacts · Activity. The sidebar holds the link switch, plan and profile; the top bar has search, notifications and the account menu.

### Sender loop

1. Open the receiver's link (Classic or Stage style) and choose a WAV or MP3.
2. Title and artist are read from ID3 / WAV INFO tags or an `Artist - Title` filename. Duration, waveform and BPM come from the file.
3. Add name, email and genre, with an optional message, release and demo status.
4. Get a private receipt, a confirm-your-email link, and emails for each signal.

### Signal definitions

Defined once in `src/lib/plans.ts` and shown to both sides.

| Signal | Meaning | Sender sees it |
| --- | --- | --- |
| Listened | Played ≥ 30 s, or ≥ 25 % of a shorter track (seeks excluded, re-checked on the server) | Yes |
| Downloaded | The original file finished transferring (aborted downloads don't count) | Yes |
| Replied | Receiver sent a message | Yes |
| Kept / Could be better | Explicit receiver decision | No, private |

### Trust, security & privacy

- Structural audio validation (WAV RIFF/fmt/data, MPEG frame sync) rejects disguised executables, archives and truncated files. **Not** a malware scan.
- 250 MB limit; per-connection (10/hour) and per-email (5/day) upload limits per link; login, sign-up, reset and contact-form limits. All limits are stored in the database, so they hold across server instances.
- Invite-only sign-up during the beta. Passwords hashed with scrypt; session and reset tokens stored only as hashes; reset signs out every device.
- Senders confirm their email by clicking a button (link scanners can't auto-verify). Receivers can block senders and set closing dates.
- Retention: undecided tracks deleted after 90 days, "could be better" 30 days after marking, kept tracks when the receiver deletes them. Upload IPs are kept 48 hours. Receivers can delete their account and every file.
- Security headers (no framing, nosniff, HSTS, strict referrer), private pages excluded from search, link previews for receiver pages.

## Not built yet

- Antivirus scanning of uploads (ClamAV or a provider) before a public launch.
- Payments (plan switching is free during the beta).
- Reply templates, BPM/key filters, key detection, set-test notes, duplicate detection, team workspaces.
- Error monitoring (e.g. Sentry) and product analytics; events are recorded so beta metrics can be computed from the database.
