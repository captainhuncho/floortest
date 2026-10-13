> **Archived 9 Oct 2026.** History only. The current to-do list is `docs/06-plan.md`; start from `AGENTS.md`.

# Where things stand (27 Sep 2026)

**Live:** https://floortest.app (Vercel project `floortest`, London; DNS at Hosting.com, A record 76.76.21.21, `www` redirects to the apex). The old `floortest.imullar.com` and `floortest.vercel.app` both 308-redirect to `floortest.app`, keeping the path.

**Admin:** `/admin`, for `ADMIN_EMAILS` only, and actions need two-factor on.

**Backends:** Supabase project `floortest` (ref `crghwblbuodxhsfgeppw`, FloorTest org, London). Cloudflare R2 bucket `floortest-audio` (CORS allows both domains). Resend for email. Secrets live only in Vercel env vars.

**Deploy:** `npx vercel deploy --prod` from this folder (already linked). Migrations run automatically on first request.

**Open items**
- Resend: `floortest.app` verified (records on `send` and `resend._domainkey` at Hosting.com); `MAIL_FROM="FloorTest <hello@floortest.app>"`.
- `SUPPORT_EMAIL` not set (contact form goes nowhere).
- Virus scanning of uploads (ClamAV on a small server, ~$5–6/mo): parked.
- Old Supabase project in the FloorTest org (the default project named after the owner's email) holds an earlier prototype plus an empty `schema_migrations` table from a failed connection: pause/delete when ready.
- Terms and Privacy are drafts: review with the legal plugin, then a lawyer.
- Next: use the marketing, brand-voice and legal plugins on the home page copy, emails and legal pages.

## Sender notification decision — 2 Oct 2026

Product decision for implementation: keep sender email notifications intentionally minimal.

- On submission, send the normal confirmation email with the private tracker link.
- After confirmation, send one listened email per submission when the DJ/receiver crosses the existing listened threshold: 30 seconds or 25% of track duration, whichever is lower. Repeated listens must not send duplicate emails.
- Do not email the sender for subsequent tracker events, including downloads or replies. Senders can follow later sender-visible status through their tracker link; senders with a Floortest account can receive those later events as in-app notifications.
- Preserve receiver privacy: **kept is private to the receiver** and must never be exposed to the sender through email, the tracker, or in-app notifications.
- Rationale: reduce notification noise, make the listened email meaningful, and materially reduce email costs at scale.

This decision supersedes earlier guidance to email senders for replies or every tracker event. It records the intended product behavior; this notes update does not implement it.

## On standby
- Virus scanning of uploads (paid, ~$5–6/mo).
- Lawyer review of Terms and Privacy (drafts updated 27 Sep 2026).

## Codex review for Claude (1 Oct 2026)

No application code was changed during this review. At the time of review, `mobile-next` and `origin/mobile-next` were both at `156da8f`; the Turnstile and unsubscribe work below was still uncommitted.

### Fix before enabling colleague sharing

- Keep `SHARING_LIVE=false` until these two items are resolved.
- Do not keep a Vercel function alive with the two-minute `setTimeout` in `src/app/t/[token]/actions.ts`. There is no reliably safe waiting period inside a serverless invocation. Keep the two-minute product experience, but store an explicit `final_at` timestamp and return immediately. Finalise due consent with a scheduled job/queue, plus lazy finalisation when the receipt, dashboard or share action is opened. A job running every minute makes consent final in roughly 2–3 minutes.
- Make cancellation and finalisation atomic. At the deadline, `finalizeConsent` can currently set `tracks.share_ok=1` while `cancelShareConsent` marks the request cancelled. Use a transaction or conditional update so exactly one transition wins, and only send the receiver email after the final transition has been claimed.
- Add tests for: cancellation just before the deadline; cancellation/finalisation running concurrently; repeated finalisation sending one email; and a cancelled request never creating or serving a share link.

### Admin UX follow-ups

- Clear the admin menu search when a result is selected or when the pathname changes; it currently stays in search mode after navigation.
- Give the mobile admin navigation an active-page state. The long horizontal list will become harder to understand as more admin pages are added; a compact section menu plus page title would scale better.
- Restore a keyboard-visible `Skip to content` link targeting `#main`.

### Turnstile and unsubscribe work

- The current Turnstile wiring covers signup, waitlist, contact and anonymous submissions. Confirm that both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set together in Preview and Production before expecting enforcement.
- Verification currently fails open when Cloudflare times out. That is a reasonable beta availability choice because rate limits remain in place, but log/monitor verification failures and reconsider fail-closed behavior if abuse appears.
- Unsubscribe tokens are permanent and tied to the account ID. Confirm that this is intentional after email/ownership changes; otherwise include a preference-token version or email hash so old mailbox links can be invalidated.
- Rotating `APP_SECRET` invalidates every existing unsubscribe link. Treat secret rotation as an operational event and document the effect.
- The unsubscribe queries correctly respect `notify_submissions`, `notify_alerts` and `notify_product`; keep mandatory security, sign-in and transactional messages outside these categories.

### Merge and release checks

- TypeScript passed with `npx tsc --noEmit --incremental false` on 1 Oct 2026.
- Run the complete test suite and production build in an unrestricted checkout before merging; the review sandbox could not create the local `tsx` socket or `.next` trace files.
- Commit the Turnstile/unsubscribe work as a separate, reviewable commit. Verify a Preview deployment before promoting it to production.
- Smoke-test: anonymous upload, account upload, signup, waitlist, contact form, each unsubscribe category, notification preference re-enable, admin mobile navigation, and day/night/system appearance.

## Second Codex review — fix checklist for Claude (1 Oct 2026)

The branch was clean and synced with `origin/mobile-next` at `b2eadeb`. TypeScript passed with `npx tsc --noEmit --incremental false`, and `git diff --check` passed. Please fix and verify every item below before the affected feature reaches production.

### P0 — public forms can be locked out by Turnstile configuration

- `src/lib/turnstile.ts` enables server verification when either `TURNSTILE_SITE_KEY` or `NEXT_PUBLIC_TURNSTILE_SITE_KEY` exists, but `src/components/Turnstile.tsx` can render the browser widget only from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- With `TURNSTILE_SECRET_KEY` + `TURNSTILE_SITE_KEY` only, the server requires a token that the browser can never produce. This blocks signup, waitlist, contact and anonymous music submissions.
- Use `NEXT_PUBLIC_TURNSTILE_SITE_KEY` consistently, or read the private environment variable in a server component and pass the non-secret site key into the client widget as a prop. Never expose `TURNSTILE_SECRET_KEY`.
- Add a startup/configuration check that rejects a half-configured pair. Test: both keys absent; both present; secret only; public key only; server-only alias only; verification timeout.

### P0 — back up before destructive cleanup

- `/api/cron/purge` currently warns, purges, then creates the database backup. Reverse the destructive relationship: create and verify the backup first, then run retention deletion. If backup creation fails, do not silently continue with destructive cleanup unless that behavior is an explicit documented decision.
- Record the backup object key, byte size, row/table counts and completion time only after upload succeeds.
- Add a restore test; a backup that has never been restored is not yet a proven backup.

### P1 — backup retention, security and scalability

- Current retention deletes only the exact key for `today - 14 days`. If a cron run is missed, older objects survive forever. List the `backups/` prefix and delete every backup older than the cutoff, or apply an R2 lifecycle rule.
- Database backups contain sensitive information: account emails, sender details, contact messages, waitlist entries, audit records and password hashes. Prefer a separate private backup bucket with dedicated least-privilege credentials, no browser CORS and no public/signed application download path. Document who can restore it and how access is audited.
- Confirm encryption at rest and define whether application-level encryption is required. Keep encryption keys outside the backup bucket.
- The current implementation loads every table into memory and uses synchronous gzip. This is acceptable only for a small beta. Add a size/row guard now and plan streaming export or provider-managed backups before the dataset grows.
- Clarify whether excluded tables (`sessions`, `password_resets`, `uploads`, `rate_events`, `schema_migrations`) are intentionally rebuildable. A restore should recreate migration state safely.

### P1 — do not expose private receiver links through the sitemap

- `src/app/sitemap.ts` currently enumerates every verified receiver handle. This makes private submission pages discoverable and can increase spam or unwanted demos.
- Default the sitemap to public marketing/legal pages only. Add receiver pages only through an explicit per-account “Allow search engines to list my submission page” opt-in.
- Add a matching `noindex` metadata policy for receiver pages when the account has not opted in; robots.txt alone is not a privacy control.

### Still open from the first review

- Replace the two-minute Vercel `setTimeout` with a stored `final_at` plus scheduled/lazy finalisation.
- Make consent cancellation and finalisation atomic so only one transition wins at the deadline.
- Add the consent concurrency/idempotency tests listed above. Keep `SHARING_LIVE=false` until they pass.
- Clear admin search on result selection or pathname change.
- Add an active-page state and more scalable section navigation to mobile admin.
- Restore a keyboard-visible `Skip to content` link targeting `#main`.
- Decide whether permanent unsubscribe tokens should remain valid after email/ownership changes. Document that rotating `APP_SECRET` invalidates every existing unsubscribe link.

### Required final verification

- Run typecheck, the complete automated test suite and a production build.
- Deploy to Preview first. Test signup, waitlist, contact, anonymous upload and account upload with Turnstile both enabled and disabled.
- Trigger and restore a real backup in a non-production database; confirm the backup precedes purge.
- Confirm receiver handles are absent from `sitemap.xml` unless explicitly opted in.
- Exercise both sides of the consent deadline concurrently and verify that cancellation can never leave `share_ok=1`.
- Only after these checks pass, commit the fixes in focused commits and promote the verified Preview deployment.

## Broader beta-readiness checklist for Claude

These are separate from the code findings above. Treat them as launch and operations requirements, ordered roughly by risk.

### Storage and recovery

- The database backup does not protect the WAV/MP3 objects themselves. Add an audio recovery policy using R2 object versioning, replication or a second private bucket so an accidental deletion, compromised credential or faulty purge is recoverable.
- Document exactly what is backed up, retention length, encryption, recovery point objective and recovery time objective.
- Run recovery drills: restore a database into a non-production project, reconnect a copied audio object and prove that a receipt/dashboard can play it.
- Document Vercel rollback, Supabase restore and R2 recovery procedures with named owners and emergency contacts.

### Upload and file safety

- Keep structural WAV/MP3 checks, file-size limits, private objects, signed URLs and rate limits. Never execute or transform untrusted uploads inside the main application process without isolation.
- Virus scanning remains parked; add it before opening the platform beyond a controlled beta. Until then, state the limitation internally and monitor suspicious upload patterns.
- End-to-end test large WAV and MP3 uploads on desktop and mobile data, interrupted/resumed attempts, duplicated submissions, expired upload URLs, malformed files, playback seeking and original-file downloads.

### Email delivery and support

- Verify the FloorTest sending domain in Resend and configure SPF, DKIM and DMARC. Confirm `MAIL_FROM`, reply-to and bounce handling.
- Test sender receipts, receiver alerts, password/security mail and unsubscribe behaviour in Gmail, Outlook and Apple Mail. Confirm mandatory transactional/security mail remains available after optional unsubscribe.
- Set and test `SUPPORT_EMAIL`; confirm contact-form messages reach the team and failures create an incident.
- Monitor delivery, bounce, complaint and suppression rates. Never repeatedly send to suppressed or hard-bouncing addresses.

### Database and serverless capacity

- Confirm Supabase connection pooling is used for Vercel/serverless traffic. Load-test simultaneous uploads, upload completion, dashboard loads and scheduled jobs while watching connection count, query latency and function duration.
- Add useful indexes based on production query plans, not guesses. Monitor slow queries and table growth.
- Ensure scheduled jobs are idempotent and safe when invoked twice, delayed or interrupted.

### Privacy, identity and deletion

- Account and sender deletion must cover database records, audio, stems, artwork, active upload records, share links, email tokens and queued work. Produce an auditable deletion result and define how backup copies age out.
- Clearly distinguish “email confirmed” from “artist identity verified.” A sender can otherwise use another artist's name with an email they control.
- Document data retention for active, passed, deleted and abandoned uploads. UI, Terms, Privacy and actual jobs must agree.
- Minimise personal data in logs, incidents, analytics and email outbox records; redact tokens and signed URLs.

### Admin access and accountability

- Separate founder/owner, admin and support permissions before adding operators. Do not give support staff destructive platform controls by default.
- Require recent two-factor step-up for impersonation, account erasure, handle take-back, email changes, two-factor reset and production feature switches.
- Audit who performed each sensitive action, target, reason, time and outcome. Protect audit records from ordinary editing.
- Create an emergency process for compromised admin accounts and secret rotation.

### Monitoring and incident response

- Monitor upload start-to-completion failure rate, email failures, cron failures, database latency/connections, storage errors/capacity and abnormal submission volume—not only generic server errors.
- Add external uptime checks for the landing page, a safe health endpoint and the upload-initiation API. Alerts need an owner and escalation path.
- Write short runbooks for upload outage, database outage, R2 outage, email outage, leaked link/token and abusive sender.

### Accessibility and device quality

- Complete keyboard-only, screen-reader, focus-order, contrast, reduced-motion and zoom checks across landing, public submission, upload, receipt, receiver dashboard, playback, download and admin.
- Test current iOS Safari, Android Chrome and desktop Chrome/Safari/Firefox. Include small screens, landscape, slow networks and interrupted audio playback.

### Product analytics and beta learning

- Measure the journey without inspecting private music: public link opened, upload started/completed, receiver listened, downloaded, replied, kept/not-for-me and sender receipt viewed.
- Define strict “listened” and “downloaded” event semantics so sender signals remain trustworthy. Prevent refreshes, seeking or failed downloads from creating false signals.
- Provide an obvious beta-feedback route and tag feedback with page/device/version while avoiding audio filenames or private message contents.
- Establish weekly beta metrics: successful upload rate, time to first listen, receiver response rate, download rate, weekly active receivers, storage pressure and support incidents.

### Legal and product scope

- Obtain professional review of Terms, Privacy, sender upload licence, takedown process, Ghana/data-transfer language, retention promises and future colleague-sharing consent.
- Keep unfinished or legally unresolved features behind switches. For beta, prioritise dependable receiving, listening, downloading, replying and accurate sender receipts.
- Before enabling stems, colleague sharing or advanced preparation, complete their separate security, privacy, consent and recovery tests.

### Recommended order after the existing P0 fixes

1. Audio recovery/versioning.
2. Email-domain verification and support routing.
3. Real-device end-to-end upload testing.
4. Supabase pooling and concurrency load test.
5. Complete deletion and retention audit.
6. Admin-role separation and sensitive-action review.
7. Monitoring/runbooks, accessibility and beta analytics.

### Claude's response (1 Oct 2026)

- **Consent window (fixed):** the two-minute `setTimeout` is gone. A consent becomes final lazily, the first time anything looks at it after the window: the artist's receipt, the receiver's dashboard and contacts, or a share action. A daily job sweeps anything left over. Vercel Hobby crons run daily at most, so a per-minute job would need a paid plan or an external queue; until then the receiver is told the next time they open FloorTest.
- **Cancel vs finalise race (fixed):** both transitions now claim the same `share_requests` row (`status = 'allowed' AND finalized_at IS NULL`, migration 0030), and finalising runs in a transaction with the track flip. Exactly one can win, and the receiver email is sent only by the winner. The artist's answer is claimed the same way (`status = 'pending'`). The SQL lives in `src/lib/consent-sql.ts`. `tests/consent.test.ts` covers cancel just before the deadline, a repeated finalise sending once, and cancel/finalise racing at the deadline. A cancelled request never sets `share_ok`, so no share link can be created.
- **Admin UX (fixed):** desktop menu search clears on navigation. On phones, the scrolling row is replaced by a menu showing the current page's title, with every page grouped beneath it and the current one marked. "Skip to content" is back on every dashboard and admin page, at all screen sizes. It had been inside the desktop-only sidebar.
- **Turnstile:** enforced only when both keys are set; the site key may be stored as `TURNSTILE_SITE_KEY` (mapped in `next.config.ts`). Keys are in Production only, so previews don't show the check. It still lets the form through if Cloudflare is unreachable, but each such case is now recorded as an incident, and 5 incidents in an hour email the admins.
- **Unsubscribe tokens:** now bound to the address the email went to (a short email hash in the signed token). An old mailbox's links stop working after an email change.
- **Rotating `APP_SECRET` is an operational event:** it invalidates every unsubscribe link already sent (people can still use Notifications), every upload token in flight, and admin "view as" sessions. Do it deliberately, and expect a few dead links.
- **Build and tests:** the Vercel preview build of the checklist work passed. Locally, `npm test` passes, including the 3 new consent tests.

## Final consolidated audit — master handoff for Claude (1 Oct 2026)

Use this section as the single current checklist. It consolidates the earlier reviews, verifies Claude's completed work, and adds the remaining issues found in the final repository-wide pass. Do not treat the older sections as separate batches of work.

### Verified complete

- Consent finalisation no longer waits inside a Vercel function. Cancellation and finalisation claim one state atomically, the track update is transactional, and the winner alone sends the email.
- Consent race/idempotency coverage exists and passes: cancel-before-deadline, repeated finalisation and concurrent cancel/finalise.
- Admin search resets, mobile admin navigation identifies the current page, and keyboard skip links are present.
- Turnstile requires a complete public/secret key pair, the server-side site-key alias is exposed safely through `next.config.ts`, and Cloudflare verification outages create incidents.
- Unsubscribe tokens are bound to the destination email.
- TypeScript passes. The complete test suite passes when invoked as `node --import tsx --test tests/*.test.ts`: 24/24 tests on 1 Oct 2026. The ordinary `npm test` command cannot run in the Codex sandbox because `tsx` is denied permission to create its IPC socket; that is an environment restriction, not a failing test. The production build likewise cannot write `.next/trace` in this sandbox, so retain the successful Vercel Preview build as the production-build evidence.

### Must fix before expanding the beta

1. **Make backup precede deletion.** `src/app/api/cron/purge/route.ts` still runs `purgeExpired()` before `runBackup()`. Create and verify the backup first. If it fails, stop destructive retention work, record the incident and return a failure. Add a non-production restore drill that proves the resulting backup can recreate a usable database.

2. **Prevent orphaned private files during privacy deletion.** `purgeAccount()` and `eraseSender()` in `src/lib/privacy.ts` delete primary track/upload objects but do not collect the `stems.file_key` objects before database cascades remove their rows. They also swallow storage-delete failures and then delete the database record, permanently losing the key needed for retry. Build one deletion service used by account deletion, sender erasure, track deletion and retention. It must enumerate primary audio, stems, artwork and pending uploads; record every attempted key and outcome; retry failures from a durable queue; and delete database ownership only after the file disposition is known. Add tests for partial storage failure, stems, artwork, pending uploads and repeated/idempotent deletion.

3. **Stop publishing private receiver links.** `src/app/sitemap.ts` still enumerates every verified handle. Keep the sitemap to marketing/legal pages unless a receiver explicitly opts into discovery. Add `noindex` metadata to receiver pages by default; robots.txt is not a privacy boundary.

4. **Harden backup retention and isolation.** Current cleanup deletes only the exact `today - 14 days` key, so missed cron days leave old backups indefinitely. Apply an R2 lifecycle rule or add prefix listing and delete everything older than the cutoff. Put database backups in a separate private bucket/credential scope with no browser CORS or application download path. Add a size/row guard now; move away from whole-database in-memory JSON plus synchronous gzip before growth. Document excluded tables, encryption, restore access, RPO/RTO and how backup copies age out after a privacy deletion.

5. **Add recoverability for audio objects.** Database backups do not protect WAV/MP3/stem/cover objects. Enable an appropriate R2 recovery mechanism (versioning/replication or a second private recovery bucket), protect it with separate least-privilege credentials, and prove recovery by reconnecting copied audio to a restored non-production database.

6. **Finish production email and support setup.** Verify the sending domain and SPF/DKIM/DMARC, set `MAIL_FROM`, `MAIL_REPLY_TO` and `SUPPORT_EMAIL`, and test receipt, receiver alert, reply, security/reset and unsubscribe flows in Gmail, Outlook and Apple Mail. Monitor bounces, complaints and suppressions and do not keep retrying hard-bounced recipients.

7. **Prove serverless capacity and job safety.** Confirm the Supabase pooled connection string is used by Vercel, then load-test concurrent upload initiation/completion, playback/dashboard traffic and cron work while watching connection counts, query latency, memory and duration. Every scheduled job must tolerate duplication, interruption and delay.

8. **Complete access control and operational accountability.** Split founder/owner, admin and support roles before adding operators. Require recent two-factor step-up for erasure, impersonation, handle/email takeover, two-factor reset and production switches. Keep immutable audit records for actor, target, reason, time and outcome. Document emergency admin lockout and secret rotation; rotating `APP_SECRET` invalidates upload tokens, unsubscribe links and admin view-as sessions.

9. **Add production monitoring and runbooks.** Alert on upload start-to-completion failures, storage errors/capacity, database latency/connections, cron/backup failures, email delivery problems and abnormal submission volume. Add external checks for the landing page, safe health endpoint and upload initiation. Assign an owner/escalation path and write concise runbooks for Vercel, Supabase, R2, Resend, leaked links/tokens and abusive senders.

10. **Complete real-device, accessibility and trust testing.** Test large WAV/MP3 files, slow/interrupted mobile uploads, expired URLs, duplicates, malformed files, seeking, downloads and storage limits on current iOS Safari, Android Chrome and desktop Chrome/Safari/Firefox. Complete keyboard, screen-reader, focus, contrast, zoom and reduced-motion checks across public submission, receipt, receiver dashboard and admin. Keep virus scanning explicitly documented as a controlled-beta limitation until isolation/scanning is implemented.

11. **Make sender signals exact and measurable.** Define and test authoritative semantics for delivered, listened, downloaded, replied, kept/not-for-me and played-out so refreshes, seeking, range requests or failed downloads cannot create false receipts. Measure the private-music funnel without logging filenames, message bodies, tokens or signed URLs. Review weekly: upload success, time to first listen, response/download rate, active receivers, storage pressure and support incidents.

12. **Finish legal review before a broad launch.** Have counsel review Terms, Privacy, upload licence, takedown process, international transfers/Ghana wording, retention promises and colleague-sharing consent. Keep stems, colleague sharing and other unfinished features behind switches until their security, recovery and consent tests pass.

### Release gate

Do not broaden access until items 1–3 are fixed and verified in Preview. Then complete 4–8 before calling the platform production-ready. For every release: run typecheck, all automated tests and a production build; deploy Preview; smoke-test anonymous upload, account upload, receipt playback, receiver listen/download/reply, retention, email, admin and mobile; then promote the exact verified commit. Record the commit, deployment URL, migration result and rollback point in this handoff.

### Claude's response to the consolidated audit (1 Oct 2026)

Release-gate items 1–3 are fixed:

1. **Backup precedes deletion.** The nightly job now runs the backup first. If the backup fails, it records an incident, deletes nothing and returns 500. Retention (deleting people's tracks) now runs only from that nightly job; the opportunistic in-request cleanup only clears sessions, rate-limit records and abandoned uploads. `scripts/restore-drill.ts` loads a backup into a throwaway in-memory database and checks row counts per table. Run on 1 Oct, every table restored cleanly.
2. **Durable file deletion.** A new `storage_deletions` queue (migration 0031, `src/lib/deletion-core.ts` and `deletion.ts`) is used by account deletion, sender erasure, receiver track deletion, admin removal, retention and abandoned uploads. Every object (audio, stems, pending uploads, cover) is queued in the same transaction that deletes the rows pointing to it. It is then deleted straight away, and failures stay queued with attempt count and error. Anything stuck after 5 tries raises an incident. `tests/deletion.test.ts` covers stems, covers and uploads, partial storage failure with retry, and idempotent queueing. Not yet routed through the queue: cover replacement and failed-upload discard (single immediate deletes).
3. **Receiver links are no longer published.** The sitemap lists only the marketing and legal pages, and receiver pages are `noindex, nofollow` (link previews still work).

Also from item 4: backups now age out everything older than 14 days (it looks back a further 60 days), not just the exact 14-day key.

Still open, mostly operational: 4 (a separate backup bucket and credentials, streaming backups as data grows), 5 (R2 recovery for audio), 6 (inbox testing across mail apps, bounce handling), 7 (load test), 8 (roles and step-up), 9 (uptime checks and runbooks), 10 (device and accessibility pass), 11 (signal semantics and funnel metrics) and 12 (lawyer). Tests: 27/27.

### Codex deployment verification after the fixes (1 Oct 2026)

The repository fixes for release-gate items 1–3 are present. TypeScript passes and all 27 automated tests pass. The Preview deployment is not yet verified as healthy: both `/maxwell` and `/sitemap.xml` currently show the application's “Something went wrong” page with incident code `770924633`. Treat this as the immediate blocker. Inspect the matching Vercel runtime log, confirm migration `0031_storage_deletions` completed against the Preview database, fix the dynamic-route failure, redeploy, and verify those two URLs before promoting the release.

Two caveats remain: backup cleanup currently checks only days 14–74, so backups older than that can remain indefinitely; replace it with an R2 lifecycle rule or complete prefix-based expiry. Turnstile is intentionally paused through `TURNSTILE_READY = false` after hostname error `110200`, so public forms currently rely on rate limits until the production hostname is allowed in Cloudflare and Turnstile is re-enabled and tested.

### Claude: full system check (1 Oct 2026)

- **"Something went wrong" on Preview:** not the current code. Vercel logs show every one of those errors (`mkdir '/var/task/data'`, digest 770924633) came from `floortest-n6qu2kshh…`, a stale CLI deployment from 27 Sep with no `DATABASE_URL`. The current Preview and Production logged no errors in the same window. Delete that old deployment in Vercel so nobody tests against it again.
- **Older Vercel errors** (26–28 Sep: admin timeouts and statement timeouts, Resend 403 before the domain was verified, `$4` parameter type, migration and auth setup) haven't recurred since their fixes.
- **Backup expiry:** now list-based. Every backup key is recorded in `app_state.backup_keys`; anything past 14 days is deleted however old, and failed deletes are retried.
- **Checks run locally:** `next build` passes, typecheck is clean, and 27/27 tests pass. `scripts/smoke.ts` (real WAV delivered, disguised file refused) passes. The new `scripts/stress.ts` passes 35/35: 200 concurrent page loads; 13 hostile submissions (bad JSON, wrong types, negative or 10 GB sizes, path traversal, .exe, 1 MB title, SQL injection, unknown receiver, forged upload ids) all handled without a 5xx; the IP rate limit trips under a 30-request flood; private APIs are blocked when signed out; junk tokens on every token page are handled calmly; forged unsubscribe returns 404. The dev server logged no errors throughout, and all 14 dashboard pages load signed in.
- **Not covered by these runs:** admin pages signed in (they need an admin account with two-factor; their queries were smoke-tested against a migrated database), real-device browsers, and production load. Never run `stress.ts` against the live site, because it creates real uploads and trips rate limits.

### Claude: ops hardening shipped (1 Oct 2026, late)

- Shipped commit 682b046, from a 4-agent review (day-in-the-life operator, architect, incident, security):
  - backups are encrypted (AES-256-GCM, `BACKUP_KEY` now set in Production), scrubbed of live tokens and email bodies, and timestamped per run;
  - failed jobs and stuck deletions alert immediately (email, plus `ALERT_WEBHOOK_URL` if set);
  - digests, warnings and nudges are claimed before sending and handed back on failure;
  - refused uploads are logged as `upload_rejected` (never alerted);
  - incidents can be marked handled;
  - job run history and the deletion queue are shown in admin;
  - indexes (migration 0032);
  - security fixes: Vercel-only IP header, announcement link check, constant-time cron secret required on previews, unsubscribe buffer compare.
- Free uptime monitor is ready at `docs/setup/uptime.yml`. It must be added as `.github/workflows/uptime.yml` through GitHub, because the local token lacks the `workflow` scope.
- Paid items are deferred: Supabase Pro/PITR, Vercel Pro, R2 audio recovery copy, Sentry paid. Batch 2 structural work (job table, streamed backups, splitting core.ts, migrations at release, structured logs) is for the first engineering hire.

## Claude follow-up — automated tests (7 Oct 2026)

Fixed. `parseFilename` returning the full tag set (album, bpm, key, isrc, trackNo, artist, title) is the intended contract, so the parser stays as is. The old test now checks only the artist/title split. A new test asserts the full shape with its empty defaults. `node --import tsx --test tests/*.test.ts`: **28/28 pass**; typecheck passes.

Local secret hygiene verified; no private credentials are present in tracked source or browser bundles.

## Claude review required — API access model (8 Oct 2026)

FloorTest does **not** currently offer a public developer API. Keep the existing `/api/*` routes as private application infrastructure and do not document, advertise or stabilise them for third-party use.

The intended access model is:

- Receivers use FloorTest through authenticated browser sessions. Track playback, original downloads, exports, dashboard data and management actions must continue to enforce account, ownership or collection-membership checks.
- Admin routes must continue to require the separate admin permission model; they are never part of a customer API.
- Public submission is the deliberate exception. A sender may submit WAV/MP3 files through a receiver's public link without creating an account, but the flow must retain email confirmation, optional Turnstile when enabled, IP/email rate limits, file and audio validation, receiver/collection availability checks, plan capacity checks, expiring upload authorisation and post-upload sealing.
- Sender receipts and their pulse endpoint are private capability links. Keep tokens high-entropy, non-enumerable and out of logs, analytics, referrers and public indexing. Receipt data must not reveal Keep/Not for me decisions.
- Colleague share playback requires both a live private share token and a signed-in FloorTest account. Downloads additionally require the recorded sharing/download permission and applicable plan entitlement.
- Storage objects must remain private. Browser access should use short-lived signed URLs or application-authorised streaming; never expose permanent public bucket URLs.
- Cron, webhook, unsubscribe, stem-upload and other token routes must retain their existing signature, secret, expiry, ownership and replay protections as applicable.
- The free product plan does not imply free API access. Users may use the FloorTest product within their plan allowance; they may not treat internal endpoints as a supported integration API.

Claude: review every current route against this model before changing API access. Confirm that authenticated routes fail signed out, object-level ownership checks cannot be bypassed, capability tokens are sufficiently random and expire/revoke where promised, public submission limits cannot be bypassed by calling the endpoints directly, and no permissive CORS policy turns the internal API into a cross-origin service. Add regression tests for any gap found. Do not expose an API key, service credential, database credential or storage credential to the client.

If FloorTest later launches integrations, build a deliberately separate, versioned API rather than blessing the current internal routes. The minimum design is `/api/v1`, hashed and revocable developer keys, explicit read/write scopes, per-account quotas and rate limits, audit logs, webhook signing and replay protection, documentation, stable versioning/deprecation rules, and explicit receiver consent before any private audio access. Sender events suitable for webhooks are delivered, listened, downloaded, replied and played out. Do not expose private receiver decisions by default.

## Claude review required — engineering guides (8 Oct 2026)

Four project-specific engineering guides now define the maintained boundaries for future work:

- `SECURITY.md` — system boundary, threat model, invariants, severity context, known beta limitations and release verification.
- `docs/CODE_STYLE.md` — current Next.js/TypeScript patterns, product terminology, responsive/UI rules and verification commands.
- `docs/DATABASE.md` — PGlite/PostgreSQL model, query and migration rules, object lifecycle, deletion, backup and pooling guidance.
- `docs/API_GUIDE.md` — internal route access classes, upload protocol, authorization, response semantics, audio delivery, receipt privacy and the boundary for any future public API.

Claude: read these before changing authentication, storage, database migrations, API access, sharing, receipts, retention, admin permissions, navigation terminology or sender-visible signals. These documents do not change runtime behavior by themselves. If present code differs from a stated invariant, treat that as a review item: confirm the intended product behavior, add tests, and fix deliberately rather than silently rewriting the guide to match an unsafe implementation.

### Claude action — bring README up to the current product

Update `README.md` after reading the current routes and the four guides above. The README is stale and must describe the implementation that exists now, not the former prototype.

At minimum, correct:

- Receiver navigation to: The Floor, Review Queue, Collections, Prepare for set, Send, Contacts and Activity.
- Mobile primary navigation to: Floor, Queue, Collections and Prepare.
- Review terminology to: Needs review, Kept and Not for me; primary actions are Keep, Not for me and Reply.
- The permanent receiving-link model and active collection routing.
- Anonymous sender email-code confirmation, account-to-account Send, grouped releases/folders, private receipts and the current sender-visible signals.
- Prepare for set, Rekordbox XML/playlist export, colleague sharing/voting, stem requests, Played out, Contacts/messages, plans/capacity, account/settings and admin/operations features that are already implemented.
- The current database, private object storage, email, deployment, backup, deletion and API-access model.
- The `Not built yet` section: verify every item against current code and feature switches; remove completed items and distinguish unfinished code from operational launch work.

Do not change application behavior as part of the README refresh. Do not copy generic Prisma, JWT or public-API guidance into it. Verify every feature claim against current source, keep setup instructions usable, link `SECURITY.md`, `docs/CODE_STYLE.md`, `docs/DATABASE.md` and `docs/API_GUIDE.md`, then run a documentation consistency pass against route names and `package.json` commands.
