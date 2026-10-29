# FloorTest Security Policy

This policy defines the security boundary and invariants for FloorTest. It applies to the application, API routes, database, object storage, email delivery, scheduled jobs, admin operations, tests, scripts and deployment configuration in this repository.

It is guidance for maintainers and security reviewers. It does not replace incident response, legal review or production access controls.

Five sections, in the owner's order (global rule, 26 Oct 2026): 1 Security rules, 2 Sign-in and permissions, 3 Data, 4 Threat model, 5 Pre-launch checklist. Written from the code; anything not built yet is marked **Gap**, never as done. When this file and the code disagree, the code wins and this file is fixed. [docs/11. Authentication & Security.md](docs/11.%20Authentication%20%26%20Security.md) links here rather than repeating it.

## 1. Security rules

### What's protected

FloorTest is a private music-receiving platform. DJs, performers, selectors, labels and other receivers create accounts and share permanent submission links. Senders may upload WAV or MP3 files without creating an account, receive a private receipt and be notified about permitted engagement signals. An account can have a team: people with their own logins who work that account's desk with a role (Owner, A&R / Admin, Member). A receiver can also open a collection to named listeners through a collection share link (held behind the `sharing` switch until the legal wording is approved).

The production boundary includes:

- The Next.js application and server routes in `src/`.
- PostgreSQL data accessed through `src/lib/db/`.
- Private S3-compatible object storage used for audio, stems, artwork, uploads and backups.
- Resend email delivery and inbound delivery events.
- Vercel Functions, scheduled jobs and deployment configuration.
- Authenticated receiver, team-member and operations/admin surfaces, and verified share-link listeners.
- Public receiver pages, anonymous submission, email confirmation, receipts and other capability-link flows.

The most sensitive assets are original audio, stems, sender identity and contact information, private messages and replies, receiver decisions and notes, receipts, collection share-link addresses and listener sessions, team invites, account sessions, password-reset and email-verification tokens, admin access, credentials, backups, audit records and deletion records.

### Who is trusted

Authenticated users are trusted only for actions on resources they own or have explicitly been granted access to. Authentication alone never establishes authorization to another receiver's tracks, senders, collections, receipts, exports or settings.

FloorTest administrators are privileged but remain subject to role checks, two-factor requirements, step-up checks for sensitive actions, read-only impersonation boundaries and audit logging. Support access must not silently inherit founder or destructive privileges.

PostgreSQL (Neon), private object storage, Resend, Vercel and Cloudflare are external trust boundaries. Credentials for them are server-only. Signed storage URLs and capability links are temporary delegated authority and must be treated as secrets.

Everyone else (public visitors, anonymous senders and everything they send) is untrusted: see Input handling below and section 4.

### Rules that must stay true

The following properties must remain true:

1. **Tenant isolation.** Every receiver-owned read or mutation checks the authenticated user and resource ownership on the server. Object identifiers alone never grant access. On a team, the desk being worked on is resolved on the server on every request from the session and a current `account_members` row (`currentUser()`); the `ft_desk` cookie only selects among desks the person already belongs to, and removal ends access on the next request. Audio redirects are never cached, so every new play is checked; a track that was already playing can finish on its signed link (at most an hour). Under the app's checks sits a second lock in the database (migration `0097_person_rules`): work done for a signed-in person can run as the role `ft_person` (`asPerson` in `src/lib/db`), and its policies show only rows on desks that person may work (their own, or a team account they're a current member of), whatever the query asks for. Private file access (`fileAccess` in `src/lib/file-access.ts`: playback, downloads, stems, artwork and the app) and the track and sender ownership checks (`ownedTrack`, `ownedSender`: review, analysis, listens, contacts and app decisions) run this way; widening it to every desk query is plan item B8. Tables without per-person policies refuse `ft_person` outright. Evidence: `tests/person-rules.test.ts` (database level, forged desk ids) and `e2e/isolation.spec.ts` (two real receivers: the other's track and collection answer exactly like a missing id; signed out gets nothing private).
2. **Private audio.** Storage buckets are private. Playback, downloads, exports and stems require ownership, current team membership of the owning account, or a valid collection share-link session. Permanent public object URLs are prohibited.
3. **Internal API boundary.** Existing `/api/*` routes are application infrastructure, not a public developer API. The free product plan does not grant third-party API access.
4. **Bounded public intake.** Anonymous submission is intentionally public only through a receiver's active link. It retains email confirmation, rate limiting, receiver and collection availability checks, plan capacity checks, file-size limits, permitted extensions, structural audio validation, expiring upload authorization and post-upload sealing.
5. **Untrusted media.** A filename, extension, MIME type, metadata tag or browser-generated waveform/BPM value never proves file safety. Server-side validation is required before a file becomes a track.
6. **Capability-token secrecy.** Receipt, reset, verification, unsubscribe, stem-upload, upload, collection share-link, team-invite and admin-view tokens are high-entropy or cryptographically signed, narrowly scoped, non-enumerable and expired or revoked when promised. Raw reusable tokens do not enter logs, analytics, incident details or source control. Share-link addresses, listener sessions and team invites are stored only as fingerprints and shown once.
7. **Sender privacy.** A sender receipt exposes only the approved sender-visible lifecycle. Keep and Not for me decisions, private notes, team comments and the shortlist, and who on a team did what remain private unless the receiver deliberately communicates them. Senders only ever see the account's name.
8. **Trustworthy signals.** Delivered, listened, downloaded, replied and played-out events follow their published definitions. Refreshing, seeking, partial downloads, retries or forged requests must not create false signals.
9. **Session and credential safety.** Passwords use the approved password hash. Session, reset, email-change and email-confirmation tokens are stored as hashes. Authentication cookies remain HTTP-only, secure in production and appropriately same-site; the browser session cookie carries the `__Host-` prefix in production, so no subdomain can set or replace it. A browser session nobody has used for 14 days ends by itself (the app's refresh tokens are exempt from the idle rule, but an app sign-in lasts at most 90 days however often it refreshes). An ops session ends after 30 minutes without use and 8 hours after sign-in. Changing or resetting the password ends every other session, the app and the ops area included, and voids any reset link not yet used (`revokeAllSessions` in `src/lib/sessions.ts`; test: `tests/session-limits.test.ts`). The old cookie name from before 15 Oct 2026 is read only until 15 Nov 2026. The Security page lists every signed-in device (a device label and last use, never the IP) and can end any one of them. Secrets remain in deployment environment variables and never enter client bundles.
10. **Administrative safety.** Admin routes require the appropriate operations permission. Sensitive actions require the configured recent two-factor or step-up protection and produce an audit record containing actor, target, action, time and outcome.
11. **Safe deletion.** Account, sender, track and retention deletion covers database rows and all associated audio, stems, artwork and pending uploads through the durable deletion mechanism. Partial storage failures remain retryable and observable.
12. **Backup before retention.** Destructive retention work does not run after a failed required backup. Backups are private, encrypted where configured, access-limited, recoverable and expired according to policy.
13. **Webhook and job authenticity.** Scheduled routes use the cron secret. Webhooks verify provider signatures against the raw request body and resist replay where supported. Failures are recorded without leaking secrets.
14. **Fail safely.** Invalid, missing, expired or unauthorized access returns a controlled response without revealing whether another tenant's private resource exists. Security checks occur before mutations or storage access.
15. **No hidden broadening.** Changes to CORS, signed-URL lifetime, token lifetime, authentication, rate limits, sharing, retention, plan entitlements, team roles or admin permissions require an explicit security review and tests.
16. **Team roles are enforced on the server.** Account-level pages and every account-level server action call `requireRole` (`src/lib/auth.ts`): account security, billing, plan, referrals and account deletion need the Owner (so they work only on your own account); links, routing, team management, deleting tracks or collections, sending as the account and adding tracks need A&R / Admin or above. A&R / Admin powers require two-step sign-in on the admin's own login, otherwise they act as a Member. An Owner needs two-step sign-in to manage the team (invite, cancel an invite, change a role, remove someone, reply approval); working the desk needs nothing more (owner, 15 Oct 2026). A Member cannot change a call made by an Owner or A&R / Admin. Hiding a control is never the only guard. `scripts/check-desk-roles.ts` holds every dashboard server action and desk API route to a stated role. A seat grants the plan's features only on that desk, never on the person's own account.
17. **Share-link listeners are named and verified.** Nobody listens anonymously: a listener must match the link's list (an exact email, a company domain that is not a personal email provider, or a FloorTest account) and prove it with a one-time email code or a signed-in confirmed account, then accept the access notice. Sessions are short (at most 12 hours), tied to the link's current generation, and end at once on reset, revoke, removal from the list, suspension or (for account sessions) sign-out. Only tracks sent under the private-sharing wording (`tracks.share_terms`) are reachable, and a sender can withdraw a track from their receipt. Requests to join are rate-limited and never reveal the collection.
18. **Scripts run only with the request's nonce.** Every page's Content-Security-Policy (`src/lib/csp.ts`, sent by `src/proxy.ts`) allows a script only if it carries that request's random nonce, plus what such a script loads (`'strict-dynamic'`: Turnstile, and Vercel Analytics and browser Sentry after Accept). `script-src` never has `'unsafe-inline'` (or `'unsafe-eval'` outside development), so injected markup can't run code. Pages are rendered per request for this (the root layout awaits `connection()`); a page built ahead of time would carry no nonce and stop working. Static files the proxy skips get the same policy without a nonce from `next.config.ts`. `style-src` still allows inline styles. Tests: `tests/csp.test.ts`, `e2e/csp.spec.ts`.
19. **Other sites can't read or change anything through the API.** No route sends `Access-Control-Allow-Origin`. The proxy refuses (403) any POST, PUT, PATCH or DELETE to `/api/*` that a browser marks as started on another site (`Sec-Fetch-Site`, or `Origin` on older browsers; `src/lib/cross-site.ts`); requests with neither header (the phone app's native calls, webhooks, one-click unsubscribe) carry no browser cookies and pass. Server actions get Next's own Origin check. Tests: `tests/cross-site.test.ts`, `e2e/guards.spec.ts`.

### Input handling

Assume that public visitors, anonymous senders, uploaded files, filenames, metadata, form fields, request headers, query parameters, capability tokens presented by clients, webhook payloads and all browser-controlled analysis values are attacker-controlled.

- **Database queries** use the shared `q` interface with parameter placeholders for every user-controlled value; receiver-owned queries are scoped by owner or membership (`docs/DATABASE.md`, Query rules). No second ORM.
- **Files** are checked by content (RIFF/MPEG structure, no trailing payloads), never by name, extension, MIME type or browser-made waveform/BPM (invariants 4 and 5), then virus-scanned when `SCAN_URL` is set.
- **Redirects** taken from a request go through one of two checks in `src/lib/next-path.ts`: `safeNext` (after sign-in, only `/c/a.<id>` or `/join/<invite>`) and `localPath` (a same-site path; refuses `//`, `/\` and control characters). Evidence: `tests/local-path.test.ts` (`localPath`) and `tests/safe-next.test.ts` (`safeNext` against `//`, `/\`, `\\`, other schemes including `javascript:` and `data:`, encoded `%2F%2F` and `%5C`, look-alikes with extra paths, queries or fragments, whitespace and control characters, and ordinary pages such as `/desk`).
- **Cross-site requests:** export and download routes that record a Downloaded signal refuse requests started on another site (`src/lib/same-site.ts`, `tests/same-site.test.ts`). Server actions are same-origin by Next.js.
- **Framing:** `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` on every route, production and development (`next.config.ts`; `tests/framing-headers.test.ts`, `e2e/framing.spec.ts`). HSTS, `nosniff`, `Referrer-Policy` and `Permissions-Policy` are set there too; the full CSP is production-only.
- **Bots and floods:** Turnstile on public forms (section 2), database-backed rate limits (`src/lib/ratelimit.ts`) and the Vercel Firewall rules (`docs/operations.md`, Security).

### Public and capability-based routes

Some routes must be reachable without a receiver session. That does not make them unrestricted APIs.

- Receiver profile and intake pages disclose only intentionally public callout information.
- Submission start and completion accept only the state and metadata required for a bounded upload.
- Sender email confirmation proves control of an address for the submission flow; it is not artist-identity verification.
- Receipt and stem-upload routes require their private capability token and reveal only the token's intended resource and actions.
- Unsubscribe links are scoped to the destination address and preference being changed.
- The sender-link form (`/sent`, "Everything you've sent") emails only addresses that have sent music, answers the same either way, and runs the bot check and the site-wide hourly email budget like every other public form that sends email.
- Collection share pages (`/c/<address>`, `/c/a.<id>` for listed accounts) show nothing playable before the listener is verified and has accepted the notice; a wrong, expired, reset or revoked address gives the same "not available" answer; pages are not indexed.
- Team invite pages (`/join/<invite>`) accept only for the invited, confirmed email; an invite expires after 7 days and is used once.
- Email confirmation links (`/verify-email/<token>`, `/confirm-email/<token>`) count only for the person signed in to that account, so whoever made an account with someone else's email can't get it confirmed by the real owner's click. Both links are stored only as their hash (`src/lib/token-hash.ts`), so a copy of the database holds nothing that works as the link. An account whose email is unconfirmed can't send from it, and a sender's history joins an account only once its email is confirmed.
- Export and download routes that mark a track Downloaded refuse requests started on another site (`src/lib/same-site.ts`), since session cookies still go with a top-level link. Writes to the API started on another site are refused by the proxy (invariant 19).
- Links people type are shown only as `https://` addresses (profile links, the waitlist and plan-request links in ops; `src/lib/socials.ts`, `src/lib/safe-links.ts`), and announcement links only as paths on FloorTest; `javascript:` and `data:` never become a link (`tests/safe-links.test.ts`).
- A collection share link hands over named track columns only (`LINK_TRACK_COLUMNS` in `src/lib/share-links.ts`: no sender, message or receipt key), and the app API names every field it returns (`e2e/api-v1.spec.ts`).
- Changing how an account signs in needs more than a session: password changes, email changes, turning two-factor on or off, adding a passkey and disconnecting Google all ask for the password (and the two-step code when it's on). Adding or removing a passkey emails the account.
- One-time codes (sign-in, sender email, share-link) count each try before comparing it, in one statement, so guesses sent at once can't pass the five-try limit.
- Uploads and stems are single-use: completing one claims it first, and caps (stems per track, tracks per batch or release) are checked so that requests sent at the same moment can't pass them.
- A deleted account's link names stay reserved for a year, so nobody can take over a link still in bios and receive music meant for someone else.
- Ops staff: only the super admin can suspend an ops team member, and the super admin can't be suspended.
- Private link keys and sign-in codes never reach stored copies: the ops email log keeps those emails with them hidden (they can't be resent from ops), and Sentry, Vercel Analytics and the incident log see `/receipt/[token]`, never the key (`src/lib/redact-url.ts`).
- Public health information must be minimal. Detailed operational health requires its configured authorization.

Do not add permissive cross-origin access to internal routes. A future integration API must be separately versioned and designed with hashed, revocable keys, scopes, quotas, audit logs, webhook signing, documentation and explicit consent for private audio.

### Secrets out of code

- Every credential lives in Vercel environment variables, Production and Preview separate (list and purpose: `docs/operations.md`, Settings). Production refuses to run without `APP_SECRET`. `BACKUP_KEY` also has a copy outside Vercel and the bucket.
- The only `NEXT_PUBLIC_` values are `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_VERCEL_ENV`, both public by design; the Turnstile site key is public by design too. No other secret reaches a client bundle (invariant 9).
- Never in the repo, chat, logs, commit messages, issues or handoffs: secrets, production data, private audio, reusable tokens, connection strings. Private link keys are redacted before Sentry, Vercel Analytics and the incident log (`src/lib/redact-url.ts`).
- `.gitignore` covers `.env*` (except `.env.example`, the committed template: setting names and placeholders only, never real values), `.mcp.json`, `skills-lock.json` and `.claude/settings.local.json`.
- Rotation steps for each secret: `docs/operations.md`, Rotating secrets.

### How to report

Report a finding privately to the owner; do not publish vulnerability details before remediation. **Gap:** no dedicated security contact address or disclosure page is named yet (owner's choice).

Report a finding when an attacker can realistically violate an invariant or materially weaken a boundary. Product-specific high-impact examples include:

- Reading, streaming, downloading, replacing or deleting another receiver's private audio.
- Accessing another receiver's sender identities, messages, decisions, contacts, collections or exports.
- Bypassing admin authorization, two-factor protection or the read-only impersonation boundary.
- Exposing production credentials, raw session tokens, private capability links, signed storage URLs or decrypted backups.
- Uploading unvalidated content into trusted storage or bypassing intake limits at meaningful scale.
- Forging sender-visible listened, downloaded, replied or played-out signals.
- Acting on a team desk you are not a current member of, or doing an Owner or A&R / Admin action as a Member (including through a server action called directly).
- Listening to or downloading through a share link without being a verified listener on it, or after a reset, revoke or removal.
- Preventing promised account/file deletion or losing the durable record needed to finish deletion.
- Turning an internal endpoint into an unauthenticated or broadly cross-origin data service.

Severity depends on reachability, affected data, tenant scope, persistence, required user interaction, exploit reliability and recoverability. Cross-tenant original-audio access, usable production credentials and admin compromise should normally be treated as critical or high severity.

Out of scope and exclusions:

There are no blanket vulnerability-class exclusions and no accepted vulnerabilities in this policy. Third-party service outages are not source-code vulnerabilities by themselves, but unsafe FloorTest behavior during an outage is in scope.

Findings in vendored dependencies should identify the affected direct dependency, reachable FloorTest path and practical impact. Generated build output and local demo data are not primary source, but leakage into a deployment or repository remains reportable.

## 2. Sign-in and permissions

### How people sign in

| Who | How | Where in code |
|---|---|---|
| Receivers and team members | Email and password (scrypt, N=2^15, r=8, p=3; older hashes upgraded on sign-in), breached-password check (Have I Been Pwned, k-anonymity), optional TOTP two-step, optional passkeys (WebAuthn through SimpleWebAuthn; user verification required, so a passkey signs in alone or stands in for the two-step code; one-time challenges held 5 minutes and deleted on use; the browser address must be the app's own; only the public key is stored; website only, not the apps), or Google (state + PKCE). Email confirmed by a one-time link stored as its hash | `src/lib/auth.ts`, `password-hash.ts`, `breached.ts`, `totp.ts`, `passkeys.ts`, `passkey-rp.ts`, `google-auth.ts`, `token-hash.ts` |
| Mobile app | `/api/v1/auth/login` with the same password; gets a short access token and a refresh token (stored hashed as an `app` row in `sessions`). Holds no database or storage keys | `src/lib/app-auth.ts`, `e2e/api-v1.spec.ts` |
| Ops staff | Separate sign-in (`ops.floortest.app`): an address in `ADMIN_EMAILS` or the ops team, a confirmed email and two-step every time; cookie `__Host-ft_ops` | `src/app/ops-login/actions.ts`, `src/lib/ops.ts` |
| Senders | No account. A one-time email code proves the address for a submission; receipts open by private token or confirmed email | `src/lib/sender-code.ts`, `src/lib/sent.ts` |
| Share-link listeners (held) | On the link's list, then a one-time email code or a signed-in confirmed account, then the access notice (invariant 17) | `src/lib/share-links.ts` |

Turnstile guards sign-up, log-in after wrong tries, waitlist, contact, newsletter, sender link, anonymous uploads and reopen alerts (`src/lib/turnstile.ts`); a token counts only for its own form and FloorTest's own hostnames. One-time codes allow five tries, counted before comparing. Changing how an account signs in (password, email, two-step, Google) asks for the password and the two-step code when on. Wrong sign-in gives one message whether or not the account exists.

**Gap (owner's per-user rule, 21 Oct):** an account whose email is unconfirmed can still open its own desk (a banner asks it to confirm; it can't send from the address, can't join ops, can't sign in with Google, and sender history joins only after confirmation). The rule says unconfirmed accounts get no access to private data; whether a receiver's own desk counts is the owner's call.

### How long sessions and links last

| What | Lifetime | Source |
|---|---|---|
| Browser session (`web`) | 30 days at most; ends after 14 days unused; `__Host-` cookie in production | `auth.ts` `SESSION_MS`, `sessions.ts` `WEB_IDLE_MS` |
| App access token / refresh token | 15 minutes / 60 days | `app-auth.ts` |
| Ops session | 1 hour idle, 8 hours at most | `ops.ts` |
| Ops "View as" (read-only) | 30 minutes, bound to the ops session that started it | `auth.ts` `signViewAs` |
| Password reset link | 1 hour | `auth.ts` `RESET_MS` |
| Step-up (re-enter password / code) | 10 tries an hour | `step-up.ts` |
| Sender and share-link email codes | 10 minutes | `sender-code.ts`, `share-links.ts` |
| Share-link listener session | 12 hours at most, never past the link's or listener's end | `share-links.ts` |
| Team invite | 7 days, used once | invariant 6, `/join/<invite>` |
| Signed audio and download links | 1 hour at most | invariant 1 |
| Direct-upload link | 15 minutes | `docs/05-data.md` |

"Sign out everywhere", a password change and a suspension end every browser and app session. The Security page lists each browser session (device label and last use, never the IP) with its own Sign out.

### Roles and what each may see or do

- **Desk roles** (Owner, A&R / Admin, Member): invariant 16, enforced by `requireRole` (`src/lib/auth.ts`) and held to a stated role for every dashboard action and desk API route by `scripts/check-desk-roles.ts`. The desk worked on is resolved on the server from the session and a current `account_members` row; the `ft_desk` cookie only selects among desks the person already belongs to.
- **Ops permissions** (Customer Care, Developer, Product Lead, Sales & Marketing, super admin): every ops page and action names its permission in `src/lib/ops-perms.ts`, and the build fails if one doesn't (`scripts/check-admin-perms.ts`). Only the super admin suspends ops staff, and the super admin can't be suspended.
- **Senders** see their own receipts, never the receiver's notes or decisions (invariant 7).
- **Share-link listeners** see only that collection's tracks sent under the sharing wording (invariant 17).
- The full who-can-see-what table is in [docs/05-data.md](docs/05-data.md), Who can see what.

## 3. Data

### What sensitive data is collected

Receivers' names, emails, password hashes, encrypted two-step secrets and Google account ids; senders' names, emails and profile links; original audio, stems and artwork; messages, replies, decisions, notes, team comments and listening history; share-link recipient emails; ops staff emails and notes about users; IP addresses in rate-limit records. Table by table, with where each store lives (Neon London, R2 Western Europe, Resend US, Sentry US, Vercel Analytics US): [docs/05-data.md](docs/05-data.md).

### How it's protected

- **Each person sees only their own data:** server-side ownership checks on every read and change (invariant 1); row-level security on every table, deny by default for any role but the app's owner role (`npm run check:perms` fails a table without it); per-person policies for `ft_person` on 12 tables (migration `0097_person_rules`); the database refuses a track, event or held reply pointing at another desk's sender or collection (migration `0098`). **Gap:** only file access and the track and sender ownership checks run as the person so far; the remaining desk reads and writes move over in plan item B8 (after the 1 Nov beta), and the share-link tables have no per-person policies yet.
- **Files:** private bucket, short-lived signed links after an ownership check, no permanent public URLs (invariant 2); SHA-256 fingerprints re-checked nightly, a changed or missing file is held back (`file_digests`).
- **Tokens:** sessions, resets, email-confirmation links, share links, listener sessions and team invites are stored only as hashes or fingerprints (invariant 6, `src/lib/token-hash.ts`).
- **Email copies:** sign-in codes and private links are hidden in the ops log; an email still waiting to send is sealed with a key from `APP_SECRET` and erased once sent or given up.
- **Error reports and stats:** browser Sentry and Vercel Analytics load only after Accept on the cookie banner; server Sentry carries no IP or personal data; private link keys are redacted.
- **IP addresses** live only in rate-limit records (deleted after 48 hours, `src/lib/retention.ts`) and pending uploads.

### How long it's kept and when it's deleted

- Undecided audio 90 days; Not for me 30 days; Kept until the receiver deletes. Artwork and stems go with their track. A 7-day warning email goes first.
- Deleting an account removes every file and row it owns through the durable queue (invariant 11, `src/lib/deletion.ts`), including the recovery-bucket copies. A deleted account's link names stay reserved for a year.
- Short-lived records: sessions and codes by their lifetimes above; `webhook_receipts` 30 days; `request_claims` 24 hours; share-link codes 1 day, unknown-address notes 2 days, links ended over a year ago with everything on them (`LINK_KEEP_DAYS`, pending the lawyer).
- Privacy requests (copy, erase) run from ops by the super admin.
- Full retention list: [docs/05-data.md](docs/05-data.md), Retention and deletion.

### Backups

- Nightly at 03:30 UTC, before any retention deletes (invariant 12): the database, encrypted AES-256-GCM with `BACKUP_KEY`, kept 14 days (the privacy page promises within 30). Backups hold no sessions, codes or IP addresses; live email-confirmation tokens and email bodies are blanked. A failed backup stops that night's deletions and raises an incident.
- Recovery copy (the vault, `src/lib/vault.ts`): a second private R2 bucket with every stored file and the backups; its `backups/` prefix has a 14-day bucket lock, so no key can delete a recent backup.
- Restore: `scripts/restore-drill.ts` rebuilds a throwaway database and checks row counts; a real restore goes into a new Neon branch, never production in place (`docs/operations.md`, Backups and restore).
- **Gap (B6, owner + dev, before 1 Nov):** the first confirmed vault run and a dated restore drill are not recorded in `docs/evidence/`; Neon Launch (7-day point-in-time restore) is on the owner's launch list. The central offsite backup system (`~/APP PROJECT/backups`) waits on the owner's setup steps.

## 4. Threat model

Every input listed under Input handling (section 1) is attacker-controlled. Where someone could attack, what could go wrong, and what stops it:

| Where | What could go wrong | Protection | Evidence |
|---|---|---|---|
| Desk pages, server actions, `/api/*` and `/api/v1/*` | One receiver or team member reads or changes another desk's tracks, senders, collections or settings | Server ownership and membership checks, `requireRole`, `ft_person` policies, same answer as a missing id (invariants 1, 14, 16) | `e2e/isolation.spec.ts`, `tests/person-rules.test.ts`, `e2e/teams.spec.ts`, `check:perms` |
| Audio, stems, artwork, exports | Private audio streamed or downloaded by someone else; a forged Downloaded signal | Private bucket, signed links ≤1 hour, no cached redirects, same-site check on download routes (invariants 2, 8) | `tests/file-access.test.ts`, `tests/same-site.test.ts` |
| Public intake (`/<handle>`, submit, stems) | Floods, oversized or disguised files, malware, cap bypass by racing requests | Email confirmation, rate limits, Turnstile, size and format limits, content checks, virus scan failing closed, single-use claims (invariants 4, 5) | `tests/validate.test.ts`, `tests/scan-intake.test.ts`, `tests/upload-claim.test.ts`, `e2e/upload-resilience.spec.ts` |
| Capability links (receipts, resets, invites, share links, unsubscribe) | Guessed, leaked or replayed links | High-entropy or signed, stored as hashes, scoped, expiring, redacted from logs (invariant 6) | `tests/email-tokens.test.ts`, `tests/redact-url.test.ts`, `tests/share-links.test.ts` |
| Sign-in | Credential stuffing, code guessing, session theft, account takeover via someone else's email, a stolen session adding a passkey, a replayed or phished passkey answer | scrypt, breached-password check, five counted tries, Firewall and app rate limits, `__Host-` HTTP-only cookies, 14-day idle end, confirmation counts only for the signed-in owner (invariant 9); adding a passkey needs the password (and code) and a confirmed email and is emailed; passkey challenges are one-time and deleted on use, the origin and rpID must be the app's own, user verification is required; a code sign-in that first confirms an email removes passkeys set before it | `tests/password-hash.test.ts`, `tests/sender-code-race.test.ts`, `tests/sessions.test.ts`, `tests/email-confirm.test.ts`, `tests/passkeys.test.ts`, `e2e/account-security.spec.ts`, `e2e/passkeys.spec.ts` |
| Ops / admin | Admin takeover, silent destructive actions, "View as" used to change data | Listed email, confirmed email, two-step every time, step-up, permissions per page, read-only impersonation bound to the ops session, audit log (invariant 10) | `tests/ops-hardening.test.ts`, `tests/ops-suspend.test.ts`, `check:perms` |
| Share links (held) | Anonymous or ex-listener access, leaking which collections exist | Named and verified listeners, 12-hour sessions tied to the link generation, same "not available" answer (invariant 17) | `e2e/sharing.spec.ts` |
| Framing and redirects | Clickjacking; open redirect after sign-in | Both anti-framing headers; `safeNext` and `localPath` | `tests/framing-headers.test.ts`, `e2e/framing.spec.ts`, `tests/local-path.test.ts`, `tests/safe-next.test.ts` |
| Cron and webhooks | Forged job calls or delivery reports; replays | `CRON_SECRET`; Resend signature on the raw body, `svix-id` recorded once (invariant 13) | `tests/ops-hardening.test.ts` (signed and replayed Resend webhooks) |
| Deletion and retention | A promised deletion silently fails; data deleted without a backup | Transactional deletion queue with retries and incidents; backup first (invariants 11, 12) | `tests/deletion.test.ts`, `tests/backup.test.ts`, `tests/vault.test.ts` |
| Dependencies and code | A vulnerable or look-alike package; a new injection pattern | Lockfile, `npm audit --omit=dev` in CI; CodeQL and dependency review when Code Security is on (**Gap**, B5) | `.github/workflows/ci.yml` |

### Known limitations and compensating controls

- Structural WAV/MP3 validation is not malware scanning. During the controlled beta, private storage, strict accepted formats, size limits, server-side validation and limited access reduce exposure. This limitation does not excuse parser, storage or content-serving vulnerabilities. Malware scanning: our own ClamAV service (`scanner/`, `src/lib/scan.ts`) checks every track and stem upload before it exists once `SCAN_URL` is set (a launch requirement); it reads from R2 with its own read-only key, never sends files to a third party, and fails closed. It sleeps when idle. An upload finished while it sleeps or is down is held (stored, sealed, not on any desk) until a batch job scans it; a held file becomes a track only after a clean scan, and is deleted if flagged or still unscanned after 24 hours. Never let through unscanned. Waking it (`/wake`) and scanning need the scanner secret; its public `/status` reveals only whether it is running.
- Some disaster-recovery, production load, real-device accessibility and operational exercises remain launch work. Existing backups, deletion queues, incidents and smoke/stress tests are compensating controls, not proof that recovery is complete.
- A Turnstile token counts only for the form it was solved for and only when solved on FloorTest's own addresses (never localhost in production). Turnstile may be feature-controlled. Email confirmation and database-backed rate limits remain mandatory even when the bot check is unavailable.
- Product Terms, Privacy, upload licensing, international transfers, collection-sharing consent and account-team responsibilities require professional legal review before broad launch (brief: `docs/legal/sharing-brief-2026-10-11.md`).

## 5. Pre-launch checklist

Security-sensitive work must include the smallest relevant automated tests and a manual end-to-end check. Before release, run type checking, lint, the complete automated test suite (unit and end-to-end), the ops permission check and a production build. Keep production dependencies free of known high-severity advisories (`npm audit --omit=dev`). On GitHub, CodeQL (`.github/workflows/codeql.yml`, `security-extended` queries for JavaScript/TypeScript) scans pull requests into `main` (docs-only ones skipped) and runs weekly; dependency review (`.github/workflows/dependency-review.yml`) fails any pull request that adds a dependency with a high or critical advisory. Both workflows use read-only permissions apart from CodeQL's `security-events: write`, and pin actions to full commit SHAs. **Gap:** since 24 Oct both CodeQL and dependency review are skipped until the repository variable `CODE_SECURITY` is `on`, which needs Code Security on the private repository (owner, 24 Oct: skip for now; `docs/06-plan.md` B5), so neither scans today. `.github/workflows/ci.yml` runs typecheck, lint, unit tests, `check:perms` and the audit on pull requests into `main` and pushes to `mobile-next` (docs-only changes skipped, a newer push cancels the older run; owner, 28 Oct, after the free Actions minutes ran out). The repository is private, so CodeQL and dependency review need a paid GitHub plan with Code Security, or a public repository (`docs/06-plan.md` B5). Treat a new high or critical CodeQL finding like a failed check: fix it or record why it doesn't apply before release. Verify anonymous upload, receipt access, authenticated playback/download, share links, team roles, deletion, email, admin authorization and mobile behavior when the change touches those paths.

Do not commit secrets, production data, private audio or reusable tokens. Do not publish vulnerability details before remediation. Record security decisions and remaining operational work in `docs/06-plan.md` (and `docs/operations.md` for runbooks).

### Checklist

Tick each before a launch or production release (working rules 5 and 13, `docs/working.md`). Record each as passed, failed or blocked, against the exact commit, in that release's `docs/evidence/` report.

| # | Check | How to verify |
|---|---|---|
| 1 | Types and lint clean | `npm run typecheck`; `npm run lint` shows 0 errors |
| 2 | Unit tests pass | `npm test` (includes `tests/person-rules.test.ts`, `framing-headers`, `local-path`, `same-site`, deletion, backup and token tests) |
| 3 | Permission checks pass | `npm run check:perms`: every ops page names a permission, every desk action and route has a stated role, every table has RLS and every `ft_person` grant has a policy |
| 4 | End-to-end journeys pass when sending, review, downloads, receipts, sharing, teams or auth changed | `npm run e2e` (port 3000 free); at least `e2e/isolation.spec.ts` (two-user test), `teams`, `account-security`, `guards`, `framing`, `upload-resilience`, `api-v1` |
| 5 | Production build succeeds | `npx next build`; the Vercel preview says Ready |
| 6 | No high or critical advisories | `npm audit --omit=dev`; any new dependency vetted (real publisher, no look-alike, no install script) before it's added |
| 7 | CI green | GitHub Actions Checks (`.github/workflows/ci.yml`) passed on the commit. CodeQL and dependency review: **Gap**, skipped until Code Security is on (B5) |
| 8 | No secrets committed | `git diff main...HEAD` reviewed for keys, tokens, connection strings and `.env` files; `git grep -n NEXT_PUBLIC_` shows only the Sentry DSN and Vercel env |
| 9 | Headers live | `curl -sI https://floortest.app` shows HSTS, CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (same on a receipt page and an `/api/*` route) |
| 10 | Health and readiness | `https://floortest.app/api/health` returns `{"ok":true}`; with the cron secret, readiness shows storage, `checks.scanner` ok, jobs and configuration green |
| 11 | Virus scanner on | readiness `checks.scanner` is ok and `SCAN_URL` is set in Production; a test upload reaches the desk |
| 12 | Backups ran and restore | Admin → Overview shows last night's backup; Admin → Storage & costs → Recovery copy is current; a dated `scripts/restore-drill.ts` run is in `docs/evidence/` (**Gap**, B6) |
| 13 | Consent before tracking | Private window, cleared storage: no Sentry browser or Vercel Analytics requests before Accept, none after Reject |
| 14 | Bot check and Firewall | Turnstile hostnames are only `floortest.app` and `ops.floortest.app`; Vercel Firewall rules "API ceiling" and "Sign-in pages" are on (owner's dashboard) |
| 15 | Manual end-to-end on touched paths | Anonymous upload, receipt, signed-in playback and download, share links, team roles, deletion, email, admin authorization and phone layout, as the change requires |
| 16 | Release rules followed | Sessions checked in, `main` checked for what's already there, push `main`, wait ~60 s, push `mobile-next`, deployment READY (working rules 2–10) |
| 17 | Load and recovery before wider access | `scripts/stress.ts` against a throwaway deployment and one rollback trial recorded (**Gap** for the stress run, B6; rollback trial: `docs/evidence/2026-10-24-preview-rollback-trial.md`) |
| 18 | Legal wording approved | Terms, Privacy, upload licence, sharing consent and team responsibilities reviewed by a lawyer before broad launch (owner; **Gap** until then) |
