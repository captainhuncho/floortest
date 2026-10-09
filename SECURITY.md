# FloorTest Security Policy

This policy defines the security boundary and invariants for FloorTest. It applies to the application, API routes, database, object storage, email delivery, scheduled jobs, admin operations, tests, scripts and deployment configuration in this repository.

It is guidance for maintainers and security reviewers. It does not replace incident response, legal review or production access controls.

## System and scope

FloorTest is a private music-receiving platform. DJs, performers, selectors, labels and other receivers create accounts and share permanent submission links. Senders may upload WAV or MP3 files without creating an account, receive a private receipt and be notified about permitted engagement signals.

The production boundary includes:

- The Next.js application and server routes in `src/`.
- PostgreSQL data accessed through `src/lib/db/`.
- Private S3-compatible object storage used for audio, stems, artwork, uploads and backups.
- Resend email delivery and inbound delivery events.
- Vercel Functions, scheduled jobs and deployment configuration.
- Authenticated receiver, colleague and operations/admin surfaces.
- Public receiver pages, anonymous submission, email confirmation, receipts and other capability-link flows.

The most sensitive assets are original audio, stems, sender identity and contact information, private messages and replies, receiver decisions and notes, receipts and share links, account sessions, password-reset and email-verification tokens, admin access, credentials, backups, audit records and deletion records.

## Threat model and trust boundaries

Assume that public visitors, anonymous senders, uploaded files, filenames, metadata, form fields, request headers, query parameters, capability tokens presented by clients, webhook payloads and all browser-controlled analysis values are attacker-controlled.

Authenticated users are trusted only for actions on resources they own or have explicitly been granted access to. Authentication alone never establishes authorization to another receiver's tracks, senders, collections, receipts, exports or settings.

FloorTest administrators are privileged but remain subject to role checks, two-factor requirements, step-up checks for sensitive actions, read-only impersonation boundaries and audit logging. Support access must not silently inherit founder or destructive privileges.

Supabase/PostgreSQL, private object storage, Resend, Vercel and Cloudflare are external trust boundaries. Credentials for them are server-only. Signed storage URLs and capability links are temporary delegated authority and must be treated as secrets.

## Security invariants

The following properties must remain true:

1. **Tenant isolation.** Every receiver-owned read or mutation checks the authenticated user and resource ownership on the server. Shared-collection access checks current membership. Object identifiers alone never grant access.
2. **Private audio.** Storage buckets are private. Playback, downloads, exports and stems require ownership, explicit collection membership or a valid sharing flow. Permanent public object URLs are prohibited.
3. **Internal API boundary.** Existing `/api/*` routes are application infrastructure, not a public developer API. The free product plan does not grant third-party API access.
4. **Bounded public intake.** Anonymous submission is intentionally public only through a receiver's active link. It retains email confirmation, rate limiting, receiver and collection availability checks, plan capacity checks, file-size limits, permitted extensions, structural audio validation, expiring upload authorization and post-upload sealing.
5. **Untrusted media.** A filename, extension, MIME type, metadata tag or browser-generated waveform/BPM value never proves file safety. Server-side validation is required before a file becomes a track.
6. **Capability-token secrecy.** Receipt, reset, verification, unsubscribe, stem-upload, upload, share and admin-view tokens are high-entropy or cryptographically signed, narrowly scoped, non-enumerable and expired or revoked when promised. Raw reusable tokens do not enter logs, analytics, incident details or source control.
7. **Sender privacy.** A sender receipt exposes only the approved sender-visible lifecycle. Keep and Not for me decisions, private receiver notes and internal votes remain private unless the receiver deliberately communicates them.
8. **Trustworthy signals.** Delivered, listened, downloaded, replied and played-out events follow their published definitions. Refreshing, seeking, partial downloads, retries or forged requests must not create false signals.
9. **Session and credential safety.** Passwords use the approved password hash. Session and reset tokens are stored as hashes. Authentication cookies remain HTTP-only, secure in production and appropriately same-site. Secrets remain in deployment environment variables and never enter client bundles.
10. **Administrative safety.** Admin routes require the appropriate operations permission. Sensitive actions require the configured recent two-factor or step-up protection and produce an audit record containing actor, target, action, time and outcome.
11. **Safe deletion.** Account, sender, track and retention deletion covers database rows and all associated audio, stems, artwork and pending uploads through the durable deletion mechanism. Partial storage failures remain retryable and observable.
12. **Backup before retention.** Destructive retention work does not run after a failed required backup. Backups are private, encrypted where configured, access-limited, recoverable and expired according to policy.
13. **Webhook and job authenticity.** Scheduled routes use the cron secret. Webhooks verify provider signatures against the raw request body and resist replay where supported. Failures are recorded without leaking secrets.
14. **Fail safely.** Invalid, missing, expired or unauthorized access returns a controlled response without revealing whether another tenant's private resource exists. Security checks occur before mutations or storage access.
15. **No hidden broadening.** Changes to CORS, signed-URL lifetime, token lifetime, authentication, rate limits, sharing, retention, plan entitlements or admin permissions require an explicit security review and tests.

## Public and capability-based routes

Some routes must be reachable without a receiver session. That does not make them unrestricted APIs.

- Receiver profile and intake pages disclose only intentionally public callout information.
- Submission start and completion accept only the state and metadata required for a bounded upload.
- Sender email confirmation proves control of an address for the submission flow; it is not artist-identity verification.
- Receipt and stem-upload routes require their private capability token and reveal only the token's intended resource and actions.
- Unsubscribe links are scoped to the destination address and preference being changed.
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
- Preventing promised account/file deletion or losing the durable record needed to finish deletion.
- Turning an internal endpoint into an unauthenticated or broadly cross-origin data service.

Severity depends on reachability, affected data, tenant scope, persistence, required user interaction, exploit reliability and recoverability. Cross-tenant original-audio access, usable production credentials and admin compromise should normally be treated as critical or high severity.

## Out of scope and exclusions

There are no blanket vulnerability-class exclusions and no accepted vulnerabilities in this policy. Third-party service outages are not source-code vulnerabilities by themselves, but unsafe FloorTest behavior during an outage is in scope.

Findings in vendored dependencies should identify the affected direct dependency, reachable FloorTest path and practical impact. Generated build output and local demo data are not primary source, but leakage into a deployment or repository remains reportable.

## Known limitations and compensating controls

- Structural WAV/MP3 validation is not malware scanning. During the controlled beta, private storage, strict accepted formats, size limits, server-side validation and limited access reduce exposure. This limitation does not excuse parser, storage or content-serving vulnerabilities.
- Some disaster-recovery, production load, real-device accessibility and operational exercises remain launch work. Existing backups, deletion queues, incidents and smoke/stress tests are compensating controls, not proof that recovery is complete.
- Turnstile may be feature-controlled. Email confirmation and database-backed rate limits remain mandatory even when the bot check is unavailable.
- Product Terms, Privacy, upload licensing, international transfers and colleague-sharing consent require professional legal review before broad launch.

## Change and verification requirements

Security-sensitive work must include the smallest relevant automated tests and a manual end-to-end check. Before release, run type checking, the complete automated test suite and a production build. Verify anonymous upload, receipt access, authenticated playback/download, sharing, deletion, email, admin authorization and mobile behavior when the change touches those paths.

Do not commit secrets, production data, private audio or reusable tokens. Do not publish vulnerability details before remediation. Record security decisions and remaining operational work in `HANDOFF.md`.
