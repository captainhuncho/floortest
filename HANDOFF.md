# Where things stand (27 Sep 2026)

**Live:** https://floortest.imullar.com (Vercel project `floortest`, London; DNS A record 76.76.21.21 at TMDHosting). `floortest.vercel.app` redirects there, except `/api/*`.

**Admin:** `/admin`, for `ADMIN_EMAILS` only, and actions need two-factor on.

**Backends:** Supabase project `floortest` (ref `crghwblbuodxhsfgeppw`, FloorTest org, London). Cloudflare R2 bucket `floortest-audio` (CORS allows both domains). Resend for email. Secrets live only in Vercel env vars.

**Deploy:** `npx vercel deploy --prod` from this folder (already linked). Migrations run automatically on first request.

**Open items**
- Resend: verify `floortest.imullar.com` (DNS at TMDHosting), then set `MAIL_FROM="FloorTest <hello@floortest.imullar.com>"`. Until then emails only reach the Resend account owner.
- `SUPPORT_EMAIL` not set (contact form goes nowhere).
- Virus scanning of uploads (ClamAV on a small server, ~$5–6/mo): parked.
- Old Supabase project in the FloorTest org ("maxwelladjavon@gmail.com's Project") holds an earlier prototype plus an empty `schema_migrations` table from a failed connection: pause/delete when ready.
- Terms and Privacy are drafts: review with the legal plugin, then a lawyer.
- Next: use the marketing, brand-voice and legal plugins on the home page copy, emails and legal pages.

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
