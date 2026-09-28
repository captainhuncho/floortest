# Claude next-work brief — 27 Sep 2026

This is the consolidated implementation queue referenced by `CODEX_HANDOFF.md`. Re-check current code before changing anything: sender-account, upload, review-panel and navigation work is already present but uncommitted.

## P0 — make Preview safe and testable

1. Create separate Preview Postgres, object storage, app/cron secrets, sandbox email and stable Preview `APP_URL`.
2. Seed fictional receivers, collections, senders and tracks only. Never copy beta submissions into Preview.
3. If `VERCEL=1` and `DATABASE_URL` is missing, fail clearly. Do not let PGlite attempt read-only `/var/task/data`.
4. Verify receiving link, MP3/WAV upload, confirmation, private receipt, listen threshold, Keep/Could be better/undo, download, reply, crate export and sender emails.
5. Review/revoke unused Vercel deployment-protection bypass tokens after Preview access is settled.

Acceptance: `/api/health` is healthy and `npm run smoke -- <preview-url> <seed-handle>` passes without Production data.

## P0 — beta operations blockers

1. Verify `floortest.imullar.com` in Resend and set verified `MAIL_FROM`.
2. Set `SUPPORT_EMAIL`; contact and sender-rights requests currently have no working destination.
3. Test real MP3/WAV files on iPhone Safari, Android Chrome, desktop Safari and Chrome.
4. Add uptime monitoring for authenticated `/api/health`.
5. Confirm database backups and R2 recovery before widening beta.

## P0 — trust, legal and data correctness

Resolve `docs/legal-review.md` before wider invitations:

1. Name the operator/controller and publish contact/privacy addresses.
2. Correct IP retention wording: daily purge can make “48 hours” closer to 72.
3. Define retention for sender identity, messages and track history, not only audio.
4. Confirm R2 jurisdiction and transfer safeguards for Vercel, Cloudflare and Resend.
5. Make the sender licence evaluation-only by default; public performance needs explicit agreement.
6. Add copyright/takedown, suspension, termination, backup deletion and beta pricing language.
7. Keep the honest statement that structural validation is not antivirus scanning; add scanning before public launch.
8. Get UK/EU lawyer review before public launch.

## P1 — product and copy corrections

Apply `docs/copy-review.md` and `docs/brand-voice.md` together:

1. “The file went to the booth” → “The original file was downloaded.” Download is not proof of set play.
2. Canonical words: your link/receiving link, desk, track, callout, collection, Keep, Could be better, Delivered/Listened/Downloaded/Replied, private receipt.
3. Audience: “DJs, curators and labels.” Field: “Your name or alias.”
4. Sentence-case CTAs; `↗` only for external links. Prefer Claim your link, Open your desk, See a demo link, Try the sender view, Create my link.
5. Retention: undecided 90 days; Could be better 30 days after marking; kept until deletion.
6. Remove unvalidated public prices during beta. Show limits; promise a founding rate only if committed.
7. “Your music network” → “Your link. Your collections. Your call.” There is no network feature yet.
8. Add welcome email: receiving link, sharing guidance and Space/K/X shortcuts.
9. Sender emails: confirmation before receipt link; Downloaded disclaimer; reply-to receiver only with opt-in; “You both got 10 more track slots.”
10. Verify “Every decision undoable.” If old decisions cannot be undone, describe the real scope.

## P1 — core workflow rules

1. Sending begins from a receiver’s link, never a generic Send a demo dashboard.
2. Senders need no account. Collect name/email, issue private receipt, then optionally offer Claim your account.
3. One permanent link per receiver. Changing active collection never changes the URL.
4. Collections organise callouts. Submissions is cross-collection review, can filter to one collection, and collections can be reviewed in place.
5. Inbox is track-attached conversation. Contacts/Submitters is person-level history. Do not duplicate them.
6. Minimise DJ work: play, Keep/Could be better, automatic next track, optional reply. Feedback never blocks advancing.
7. Receiver Activity shows receiver actions. Sender receipts expose only Delivered, Listened, Downloaded and Replied.
8. Replies email the sender and remain attached to the track. Never expose private decisions.
9. Incoming/collection cards remain compact and support grid/list without changing playback or decision behaviour.
10. Show real metadata: BPM, duration, format, collection. Do not claim key/mood/energy/genre/quality analysis before implementation.

## P1 — navigation, identity and access

1. Search, bell and profile stay together top-right; bell left of profile.
2. Profile menu: profile, Member since, Notifications, Referrals, plans/storage and Settings. Mobile uses a compact sheet with the same structure.
3. Get more space opens plan comparison and shows current/next tiers.
4. Owner/founder/developer/admin controls are role-gated. Receivers never see developer or operations menus.
5. Operations is for FloorTest staff, not sender/receiver approval.
6. Admin menus need backing actions; otherwise label them coming later.

## P2 — beta measurement and operations

Expose the metrics from `docs/beta-launch-plan.md`:

- activated receivers
- weekly active receivers
- tracks per active receiver/week
- median delivery-to-first-listen
- sender-to-receiver conversion
- kept-to-crate-export

Operations dashboard priorities:

1. Database, storage, email, cron and recent failures.
2. Uploads started/completed/failed, rejected formats, storage and purge queue.
3. Beta metrics by week and plan.
4. Email sent, delivered, bounced and suppressed.
5. Support requests, failed jobs and affected accounts.
6. Deletion requests, account deletion and retention jobs.

Do not expose customer content beyond incident-resolution need. Log admin actions.

## Product additions — ranked build order

These additions deepen the receiver/sender loop without turning FloorTest into general admin software.

### 1. Persistent review session

- Reopen the last track at the last playback position.
- Preserve queue position, filters, collection, volume and layout.
- Keep the player running while moving between review surfaces.
- Make “Continue reviewing” the primary returning-user action.

### 2. Receiver-controlled intake rules

- Accepted genres and audio formats.
- Maximum file size and track length.
- Closing date and pause/reopen control.
- Optional one-submission-per-sender limit for each callout.
- Optional reference track and a short “what I’m looking for” note.
- Show every active rule clearly before a sender selects a file.

### 3. Faster triage

- Filters: New, Listening, Kept, Could be better and Replied.
- Sorting: unheard first, oldest first and newest first.
- Filter by collection, BPM range, genre and sender.
- Save a filter combination as a review session.
- Keep review actions keyboard-friendly and advance automatically.

### 4. Sender relationship memory

- Previous tracks from the same sender.
- Last interaction and reply.
- Counts for listened, downloaded and kept tracks.
- Private receiver notes.
- Favourite/follow sender without creating a public social network.

### 5. Duplicate protection

- Detect identical files by hash first.
- Warn when the same sender resubmits the same track.
- Later, add acoustic matching for renamed or re-exported files.

### 6. Fast replies

- Three editable receiver reply templates.
- Personal email reply from the track.
- Optional “reply after listening” reminder.
- Keep replies attached to both track and sender.
- Never require feedback before advancing to the next track.

### 7. Set-preparation workspace

- Turn kept tracks into a temporary crate.
- Reorder tracks and add private DJ notes/energy tags.
- Export originals, M3U8 and Rekordbox XML.
- Verify that every original finished downloading before marking the crate ready.

### 8. Released-promo mode

- Unreleased demos remain the main product and default.
- A callout can optionally accept a released promotional track.
- Capture release date, label and streaming reference as context.
- Still require the downloadable audio file; never substitute a streaming link.

## Later differentiators

- Receiver response-time indicator based on recent behaviour, without publicly ranking or shaming receivers.
- Transparent storage/capacity meter and expected deletion dates.
- A quiet sender receipt showing only Delivered, Listened, Downloaded and Replied.
- Privacy controls per callout: download permission, closing date, submission limit and retention notice.
- Weekly receiver digest: unheard tracks, replies awaiting action, expiring files and crates ready to export.
- Optional watermarked previews for sensitive promos while preserving the original file for authorised download.

## Do not expand into these areas yet

- Public discovery feeds or charts.
- Paid submission boosts.
- Creator stores, memberships or communities.
- Mastering and artwork-generation tools.
- Broad promotional campaign management.
- Radio, playlist or DJ-set monitoring.

FloorTest should stay focused on one promise: the private receiving desk that gets music from the sender to the DJ’s set with less work and honest signals.

## P2 — differentiation after the core is stable

1. File-hash duplicate detection, then optional acoustic fingerprinting.
2. Reply templates and lightweight relationship notes.
3. Open-source/self-hosted key detection and filtering; BPM/waveform remain the honest current capability.
4. Set-test notes and signal only after interaction and sender-visibility rules are defined.
5. Rekordbox handoff via originals + M3U8 + XML. Do not promise proprietary waveform/cue analysis without an official integration.
6. Team workspaces only after single-receiver permissions are proven.
7. Privacy-safe product analytics and error monitoring.

## Explicitly deferred — do not imply live

- Direct Rekordbox waveform/cue integration
- Key, mood, energy, genre and audio-quality AI analysis
- Antivirus scanning
- Paid billing/automatic charging
- Team workspaces
- Set-test notes
- Duplicate/acoustic detection
- Native apps; prioritise responsive web/PWA

## Admin backend specification

The admin backend operates FloorTest; it does not approve normal senders, receivers or musical decisions. DJs control their own desks. Staff keep the service healthy, safe and supportable.

### Admin modules

#### 1. Operations overview

- Active receivers and tracks received today.
- Upload success/failure rate.
- Storage usage and capacity warnings.
- Email delivered, bounced and failed.
- Failed background jobs.
- Open incidents and support requests.
- Database, R2, Resend and cron health.
- Every warning links directly to the affected module or record.

#### 2. Accounts

- Search by name, email, handle or account ID.
- View account status, plan, storage, sign-up date and last activity.
- Resend verification and password-reset emails.
- Pause/restore accounts and revoke sessions.
- Apply temporary storage/plan overrides.
- View referrals and plan history.
- Start and monitor account deletion.
- Never expose passwords or unrestricted audio access.

#### 3. Submissions and storage operations

- Upload state and failure reason.
- File type, size, checksum, storage key and retention date.
- Rejected/quarantined files.
- Orphaned object detection and database/storage reconciliation.
- Duplicate-file warnings.
- Retry safe metadata analysis.
- Delete harmful content with reason and audit entry.
- Staff audio access requires elevated permission and is always audited.

#### 4. Email centre

- Delivered, bounced, suppressed and failed messages.
- Search by recipient, track/account and event type.
- Retry failed transactional email safely and idempotently.
- Preview templates and check sending-domain status.
- Display sender-reputation warnings.
- Disable a broken template without redeploying.
- Prevent duplicate product events from sending duplicate emails.

#### 5. Jobs and automation

Monitor retention purge, daily digest, abandoned-upload cleanup, database/storage reconciliation, audio analysis, account deletion and export generation.

Each job shows:

- last run and last success
- status and duration
- affected record count
- error details safe for staff
- safe retry action
- retry/idempotency state

#### 6. Support and incidents

- Contact-form inbox and user-reported issues.
- Status, priority, assignee and internal notes.
- Relevant account and event context attached automatically.
- Incident timeline and resolution.
- Avoid exposing unnecessary personal or music data to support staff.

#### 7. Trust and safety

- Blocked senders/accounts.
- Rate-limit and suspicious-upload events.
- Copyright/takedown requests.
- Quarantined files.
- Abuse patterns with limited IP retention.
- Security-event history.
- No approval queue for ordinary sending or receiving.

#### 8. Privacy operations

- Data access, correction and deletion requests.
- Account deletion progress.
- Storage deletion confirmation.
- Retention-job history.
- Account archive export.
- Policy-version/consent history where applicable.

#### 9. Plans and capacity

- Plan definitions and active-track limits.
- Per-account storage and capacity.
- Temporary overrides and referral bonuses.
- Accounts approaching limits.
- Upgrade conversion.
- Keep billing disabled/manual during beta until paid plans are intentionally launched.

#### 10. Product analytics

- Activated receivers.
- Weekly active receivers.
- Tracks reviewed per active receiver.
- Median delivery-to-first-listen.
- Sender-to-receiver conversion.
- Kept-to-crate-export rate.
- Review-session completion.
- Empty callouts and receivers who stop reviewing.

Do not rely on vanity upload totals without review/relationship context.

#### 11. Platform configuration

Manage without redeployment:

- signup mode and invite codes
- file size and supported formats
- retention windows
- rate limits
- maintenance banner
- feature flags
- email-template switches
- plan limits

Secrets stay in Vercel and must never be revealed in the admin UI.

### Staff roles

| Role | Access |
| --- | --- |
| Founder | Business metrics, accounts, plans and operations |
| Support | Accounts, support tickets and safe recovery actions |
| Trust & Safety | Abuse, takedowns and quarantined files |
| Developer | Health, jobs, logs and technical diagnostics |
| Super admin | Role management and destructive operations |

### Admin security requirements

- Require two-factor authentication for every staff account.
- Enforce permissions on the server, not only by hiding navigation.
- Record actor, timestamp, reason, before/after values and affected resource for every mutation.
- Require an explicit reason for destructive or privacy-sensitive actions.
- Add step-up authentication for role changes, audio access and destructive actions.
- Use pagination and scoped queries; never load entire customer tables into the browser.
- Redact secrets, password hashes, session tokens, reset tokens and signed storage URLs.
- Keep customer audio inaccessible by default.

### Admin build order

1. Server-enforced roles, two-factor gate and immutable audit log.
2. Service-health overview.
3. Account search and safe support actions.
4. Email and job monitoring.
5. Storage reconciliation and retention tools.
6. Privacy/deletion workflows.
7. Trust and safety.
8. Beta metrics, plans and feature flags.

### Admin acceptance checks

- A receiver cannot open any admin route or call any admin mutation directly.
- Support cannot access developer, trust-and-safety or super-admin actions.
- Every admin mutation produces an audit record.
- Retrying a job or email cannot create duplicate signals.
- Destructive actions require reason, confirmation and appropriate role.
- Admin pages never expose secrets, authentication tokens or unrestricted signed audio URLs.
- Empty, loading, error and pagination states work on desktop and mobile.

## Production deployment gate

1. Review dirty worktree and separate sender-account work from the compatibility patch if possible.
2. Run `npm run typecheck`, `npm test`, `npm run build`.
3. Test migrations `0013_account_sends` and `0014_maxwell_public_page_repair` on a disposable database.
4. Run full Preview smoke with fictional data.
5. Confirm Production variable names without printing values.
6. Back up Production database and confirm R2 recovery.
7. Deploy Production only with Maxwell’s explicit approval.
8. Verify health, Maxwell page, auth, upload, playback, decision, download, reply and email.
9. Identify rollback deployment before inviting testers back.

## Read before implementation

- `HANDOFF.md`
- `README.md`
- `docs/beta-launch-plan.md`
- `docs/copy-review.md`
- `docs/brand-voice.md`
- `docs/legal-review.md`
- `docs/launch-emails.md`
