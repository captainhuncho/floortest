# FloorTest Security Policy

This policy defines the security boundary and invariants for FloorTest. It applies to the application, API routes, database, object storage, email delivery, scheduled jobs, admin operations, tests, scripts and deployment configuration in this repository.

It is guidance for maintainers and security reviewers. It does not replace incident response, legal review or production access controls.

## System and scope

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

## Threat model and trust boundaries

Assume that public visitors, anonymous senders, uploaded files, filenames, metadata, form fields, request headers, query parameters, capability tokens presented by clients, webhook payloads and all browser-controlled analysis values are attacker-controlled.

Authenticated users are trusted only for actions on resources they own or have explicitly been granted access to. Authentication alone never establishes authorization to another receiver's tracks, senders, collections, receipts, exports or settings.

FloorTest administrators are privileged but remain subject to role checks, two-factor requirements, step-up checks for sensitive actions, read-only impersonation boundaries and audit logging. Support access must not silently inherit founder or destructive privileges.

PostgreSQL (Neon), private object storage, Resend, Vercel and Cloudflare are external trust boundaries. Credentials for them are server-only. Signed storage URLs and capability links are temporary delegated authority and must be treated as secrets.

## Security invariants

The following properties must remain true:

1. **Tenant isolation.** Every receiver-owned read or mutation checks the authenticated user and resource ownership on the server. Object identifiers alone never grant access. On a team, the desk being worked on is resolved on the server on every request from the session and a current `account_members` row (`currentUser()`); the `ft_desk` cookie only selects among desks the person already belongs to, and removal ends access on the next request. Audio redirects are never cached, so every new play is checked; a track that was already playing can finish on its signed link (at most an hour). Evidence: `e2e/isolation.spec.ts` (two real receivers: the other's real track and collection answer exactly like a missing id on the website and the app API, nothing of theirs changes, and a signed-out visitor gets nothing private).
2. **Private audio.** Storage buckets are private. Playback, downloads, exports and stems require ownership, current team membership of the owning account, or a valid collection share-link session. Permanent public object URLs are prohibited.
3. **Internal API boundary.** Existing `/api/*` routes are application infrastructure, not a public developer API. The free product plan does not grant third-party API access.
4. **Bounded public intake.** Anonymous submission is intentionally public only through a receiver's active link. It retains email confirmation, rate limiting, receiver and collection availability checks, plan capacity checks, file-size limits, permitted extensions, structural audio validation, expiring upload authorization and post-upload sealing.
5. **Untrusted media.** A filename, extension, MIME type, metadata tag or browser-generated waveform/BPM value never proves file safety. Server-side validation is required before a file becomes a track.
6. **Capability-token secrecy.** Receipt, reset, verification, unsubscribe, stem-upload, upload, collection share-link, team-invite and admin-view tokens are high-entropy or cryptographically signed, narrowly scoped, non-enumerable and expired or revoked when promised. Raw reusable tokens do not enter logs, analytics, incident details or source control. Share-link addresses, listener sessions and team invites are stored only as fingerprints and shown once.
7. **Sender privacy.** A sender receipt exposes only the approved sender-visible lifecycle. Keep and Not for me decisions, private notes, team comments and the shortlist, and who on a team did what remain private unless the receiver deliberately communicates them. Senders only ever see the account's name.
8. **Trustworthy signals.** Delivered, listened, downloaded, replied and played-out events follow their published definitions. Refreshing, seeking, partial downloads, retries or forged requests must not create false signals.
9. **Session and credential safety.** Passwords use the approved password hash. Session, reset, email-change and email-confirmation tokens are stored as hashes. Authentication cookies remain HTTP-only, secure in production and appropriately same-site; the browser session cookie carries the `__Host-` prefix in production, so no subdomain can set or replace it. A browser session nobody has used for 14 days ends by itself (the app's refresh tokens are exempt). The Security page lists every signed-in device (a device label and last use, never the IP) and can end any one of them. Secrets remain in deployment environment variables and never enter client bundles.
10. **Administrative safety.** Admin routes require the appropriate operations permission. Sensitive actions require the configured recent two-factor or step-up protection and produce an audit record containing actor, target, action, time and outcome.
11. **Safe deletion.** Account, sender, track and retention deletion covers database rows and all associated audio, stems, artwork and pending uploads through the durable deletion mechanism. Partial storage failures remain retryable and observable.
12. **Backup before retention.** Destructive retention work does not run after a failed required backup. Backups are private, encrypted where configured, access-limited, recoverable and expired according to policy.
13. **Webhook and job authenticity.** Scheduled routes use the cron secret. Webhooks verify provider signatures against the raw request body and resist replay where supported. Failures are recorded without leaking secrets.
14. **Fail safely.** Invalid, missing, expired or unauthorized access returns a controlled response without revealing whether another tenant's private resource exists. Security checks occur before mutations or storage access.
15. **No hidden broadening.** Changes to CORS, signed-URL lifetime, token lifetime, authentication, rate limits, sharing, retention, plan entitlements, team roles or admin permissions require an explicit security review and tests.
16. **Team roles are enforced on the server.** Account-level pages and every account-level server action call `requireRole` (`src/lib/auth.ts`): account security, billing, plan, referrals and account deletion need the Owner (so they work only on your own account); links, routing, team management, deleting tracks or collections, sending as the account and adding tracks need A&R / Admin or above. A&R / Admin powers require two-step sign-in on the admin's own login, otherwise they act as a Member. An Owner needs two-step sign-in to manage the team (invite, cancel an invite, change a role, remove someone, reply approval); working the desk needs nothing more (owner, 15 Oct 2026). A Member cannot change a call made by an Owner or A&R / Admin. Hiding a control is never the only guard. `scripts/check-desk-roles.ts` holds every dashboard server action and desk API route to a stated role. A seat grants the plan's features only on that desk, never on the person's own account.
17. **Share-link listeners are named and verified.** Nobody listens anonymously: a listener must match the link's list (an exact email, a company domain that is not a personal email provider, or a FloorTest account) and prove it with a one-time email code or a signed-in confirmed account, then accept the access notice. Sessions are short (at most 12 hours), tied to the link's current generation, and end at once on reset, revoke, removal from the list, suspension or (for account sessions) sign-out. Only tracks sent under the private-sharing wording (`tracks.share_terms`) are reachable, and a sender can withdraw a track from their receipt. Requests to join are rate-limited and never reveal the collection.

## Public and capability-based routes

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
- Export and download routes that mark a track Downloaded refuse requests started on another site (`src/lib/same-site.ts`), since session cookies still go with a top-level link.
- Changing how an account signs in needs more than a session: password changes, email changes, turning two-factor on or off and disconnecting Google all ask for the password (and the two-step code when it's on).
- One-time codes (sign-in, sender email, share-link) count each try before comparing it, in one statement, so guesses sent at once can't pass the five-try limit.
- Uploads and stems are single-use: completing one claims it first, and caps (stems per track, tracks per batch or release) are checked so that requests sent at the same moment can't pass them.
- A deleted account's link names stay reserved for a year, so nobody can take over a link still in bios and receive music meant for someone else.
- Ops staff: only the super admin can suspend an ops team member, and the super admin can't be suspended.
- Private link keys and sign-in codes never reach stored copies: the ops email log keeps those emails with them hidden (they can't be resent from ops), and Sentry, Vercel Analytics and the incident log see `/receipt/[token]`, never the key (`src/lib/redact-url.ts`).
- Public health information must be minimal. Detailed operational health requires its configured authorization.

Do not add permissive cross-origin access to internal routes. A future integration API must be separately versioned and designed with hashed, revocable keys, scopes, quotas, audit logs, webhook signing, documentation and explicit consent for private audio.

## Reportable findings and severity context

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

## Out of scope and exclusions

There are no blanket vulnerability-class exclusions and no accepted vulnerabilities in this policy. Third-party service outages are not source-code vulnerabilities by themselves, but unsafe FloorTest behavior during an outage is in scope.

Findings in vendored dependencies should identify the affected direct dependency, reachable FloorTest path and practical impact. Generated build output and local demo data are not primary source, but leakage into a deployment or repository remains reportable.

## Known limitations and compensating controls

- Structural WAV/MP3 validation is not malware scanning. During the controlled beta, private storage, strict accepted formats, size limits, server-side validation and limited access reduce exposure. This limitation does not excuse parser, storage or content-serving vulnerabilities. Malware scanning: our own ClamAV service (`scanner/`, `src/lib/scan.ts`) checks every track and stem upload before it exists once `SCAN_URL` is set (a launch requirement); it reads from R2 with its own read-only key, never sends files to a third party, and fails closed.
- Some disaster-recovery, production load, real-device accessibility and operational exercises remain launch work. Existing backups, deletion queues, incidents and smoke/stress tests are compensating controls, not proof that recovery is complete.
- A Turnstile token counts only for the form it was solved for and only when solved on FloorTest's own addresses (never localhost in production). Turnstile may be feature-controlled. Email confirmation and database-backed rate limits remain mandatory even when the bot check is unavailable.
- Product Terms, Privacy, upload licensing, international transfers, collection-sharing consent and account-team responsibilities require professional legal review before broad launch (brief: `docs/legal/sharing-brief-2026-10-11.md`).

## Change and verification requirements

Security-sensitive work must include the smallest relevant automated tests and a manual end-to-end check. Before release, run type checking, lint, the complete automated test suite (unit and end-to-end), the ops permission check and a production build. Keep production dependencies free of known high-severity advisories (`npm audit --omit=dev`). Verify anonymous upload, receipt access, authenticated playback/download, share links, team roles, deletion, email, admin authorization and mobile behavior when the change touches those paths.

Do not commit secrets, production data, private audio or reusable tokens. Do not publish vulnerability details before remediation. Record security decisions and remaining operational work in `docs/06-plan.md` (and `docs/operations.md` for runbooks).
