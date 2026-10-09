# FloorTest Internal API Guide

FloorTest does not currently provide a public developer API. Routes under `src/app/api/` support the FloorTest web application and trusted service callbacks. Their presence in a browser or network inspector does not make them a supported third-party contract.

## Access classes

Every route belongs to one of these classes and must enforce that class on the server:

### Public information

Minimal assets and deliberately public receiver/callout information. Do not include private account, sender, track or operational data.

### Public bounded actions

Anonymous submission, email confirmation, unsubscribe and contact-style flows. These accept untrusted input and require the flow-specific combination of validation, proof, rate limiting, expiry and abuse controls.

### Authenticated receiver actions

Dashboard data, playback, downloads, export and mutations require a valid receiver session plus resource ownership.

### Authenticated shared access

Colleague playback requires a signed-in account, a live share or collection membership and the current permission. Downloading may require additional plan and sender-granted permission.

### Private capability links

Sender receipts, stem uploads and similar flows use a high-entropy token to grant narrowly scoped access. A capability token is a secret, not merely an identifier.

### Administrative operations

Admin routes require the correct operations permission. Sensitive mutations require the established step-up/two-factor controls and audit logging.

### Service callbacks and scheduled jobs

Cron endpoints authenticate the configured bearer secret. Webhooks verify the provider signature using the raw body and should resist duplicate delivery.

## Current submission protocol

Submission is a two-step direct-to-storage flow:

1. `POST /api/submit/{handle}` validates the receiver, collection, sender proof, metadata, format, size, plan/capacity and rate limits. It creates a short-lived upload authorization.
2. The browser uploads the bytes directly to private object storage using the returned bounded URL.
3. `POST /api/submit/{handle}/complete` consumes the upload identifier, confirms the stored object, validates the actual audio structure, seals it and creates the track.

Do not bypass either server step. Browser-generated duration, BPM and waveform peaks are hints and must remain bounded; they do not establish file safety.

Anonymous senders confirm email before receiving upload authorization. Signed-in account senders use their account identity. A sender cannot send to their own receiver link through the account-send path.

## Authentication and authorization

- Receiver authentication uses the existing HTTP-only session cookie—not JWT bearer tokens.
- Use `currentUser()` when a route returns an HTTP authorization response.
- Use `requireUser()` for protected page/server-action flows that should redirect to login.
- Load receiver resources through `ownedTrack`, `ownedSender` or an equivalent ownership-scoped query.
- Shared access must use the established team/share helpers and recheck current validity.
- Return 404 instead of confirming another tenant's private resource where appropriate.
- Never authorize from a client-provided `user_id`, email, handle or hidden form field.

## Requests and validation

- Treat headers, JSON, form data, files, query strings and route parameters as untrusted.
- Catch malformed JSON and return a controlled 400 response.
- Bound string length, array length and numeric range before persistence or expensive work.
- Validate allowed product values against the shared definitions.
- Accept only the intended audio formats and size limits.
- Verify the stored bytes server-side before making an upload available.
- Apply database-backed rate limits to abuse-sensitive public actions.
- Do not rely on CORS as authentication. Do not enable broad CORS for internal APIs.

## Responses and errors

JSON application errors use:

```json
{ "error": "A useful, non-sensitive message." }
```

Use consistent status meanings:

| Status | Meaning |
| --- | --- |
| 200/201 | Successful request |
| 400 | Invalid or unreadable input |
| 401 | Sign-in or flow-specific proof required |
| 403 | Authenticated/proven caller is not allowed |
| 404 | Resource absent or deliberately hidden |
| 409 | Current state prevents the action |
| 413 | File or payload exceeds the limit |
| 429 | Rate limit reached |
| 500 | Unexpected server failure |

Never send stack traces, SQL, storage keys, credentials, internal hostnames or private incident detail to a client.

## Audio responses

- Owner playback may redirect to a short-lived signed storage URL.
- Shared playback stays application-authorized so revocation and expiry take effect.
- Original receiver downloads stream through FloorTest when completion must create the Downloaded signal.
- Preserve byte-range behavior for playback.
- Use private/no-store caching for capability- or share-protected responses where required.
- Sanitize download filenames and set both safe ASCII and UTF-8 forms.

## Sender receipts and signals

Receipt APIs expose only approved sender-visible state:

- Delivered
- Listened
- Downloaded
- Replied
- Played out

Keep, Not for me, private notes and internal collaboration votes are not sender-visible by default.

A refresh, seek, incomplete download or repeated request must not manufacture a signal. The server remains authoritative for thresholds and completion.

## Tokens and secrets

- Generate opaque tokens with cryptographic randomness or sign them with the application secret.
- Scope each token to one purpose and resource.
- Enforce expiry and single-use behavior where promised.
- Store reusable tokens as hashes when the server only needs equality checks.
- Keep tokens, signed URLs and credentials out of logs, analytics, incident messages and referrers.
- Rotating `APP_SECRET` invalidates several outstanding capabilities; treat rotation as a planned operational event.

## Adding or changing a route

Before implementation, state:

1. Its access class.
2. The caller and authentication mechanism.
3. The resources and ownership rule.
4. Input bounds and validation.
5. Rate limits or replay protection.
6. Idempotency behavior.
7. Sensitive logging restrictions.
8. Tests for signed-out, wrong-owner, expired-token and malformed-input cases.

Changes to authentication, sharing, CORS, signed URLs, receipt visibility, downloads, uploads, admin routes or webhooks require security review under `SECURITY.md`.

## Future public API

Do not expose the current internal routes as the public API. A future integration product should begin at `/api/v1` and include:

- Hashed, revocable developer keys.
- Explicit read/write scopes.
- Per-account quotas and rate limits.
- Audit logs and key-usage visibility.
- Signed webhooks with timestamp/replay protection.
- Stable schemas, versioning and deprecation policy.
- Documentation and a separate test environment.
- Explicit receiver consent before third-party private-audio access.

Suitable webhook events may include delivered, listened, downloaded, replied and played out. Private receiver decisions must remain excluded unless FloorTest makes a separate, explicit product and consent decision.
