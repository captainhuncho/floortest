# 29 Oct 2026 twelfth release: sign-in hardening (security)

From the 29 Oct audit. Owner's word in the desk session: "run the #94 check and ship #94".

## Build
- Release branch head (checked): `ef51fbb`, from `main` `11f89cb`.
- Contains: #94 `sec-auth-hardening` at `eeecbd1` (the security audit session). Held from release #100 because
  `src/lib/totp.ts` imported `server-only` code and the e2e suite couldn't start; fixed in `0b51762` (totp.ts takes the
  app secret as a parameter; `tests/totp-no-server-imports.test.ts` keeps it free of non-`node:` imports).
- Previous release: #103, merge `11f89cb`, deployment `dpl_BcXZtvFKDhhUQQACEVtt1cBKKKz2`.
- This release's merge commit and production deployment go in the next release's report.

## What shipped
- Sign-in hardening across web and app (audit items H64, H66 and others in #94): a spent app refresh token coming back
  ends that whole sign-in; removing a passkey asks for the password; two-step sign-in uses one-time tickets.
- Migrations `0111_app_refresh_spent` and `0112_two_step_tickets` (new tables).

## Checks
All on `ef51fbb`, locally, after `npm ci`.

| Check | Result |
|---|---|
| Production pre-check (read-only, desk via Neon) | `SELECT count(*) FROM users WHERE email ~ '[^\x01-\x7f]'` returned 0 |
| `npm run e2e` | passed (52/52 in 5.3 min), including app sign-in, token refresh and sign-out, two-factor, passkeys and isolation |
| `npm run typecheck` | passed |
| `npm run lint` | passed (0 errors) |
| `npm test` | passed (255/255) |
| `npm run check:perms` | passed (RLS on all 70 tables, per-person rules on 11, no secret columns) |
| `npm audit --omit=dev` | passed (0 vulnerabilities) |
| Audit session's checks on `eeecbd1` | e2e 52/52, unit 255/255, typecheck, lint, perms, audit |

## Status
- Live after merge: the hardening above. People who reuse an old app refresh token (a stolen one, or rarely a flaky
  connection) are signed out of that sign-in and sign in again.
- Waiting on the owner: #90 (production setting `MAIL_RESERVED_SHARE`), #91 (`wrangler deploy` after merge), #93
  (H77: whether deleting an account also removes partner notes).

## Rollback
Last good deployment: `dpl_BcXZtvFKDhhUQQACEVtt1cBKKKz2` (`11f89cb`). 0111 and 0112 only add tables the older code
doesn't use, so an Instant Rollback is safe.

## Next
#90, #91, #93 after the owner's steps.
