# 20 Oct 2026 (second release): storage errors, readiness, sealed track artwork

## Build
- Production: `main` at `3adeb72`, deployment `dpl_46bX6QctcWKu61VJB62ehNT1vANf`, READY. Branch `readiness-batch`, built from `main` (`6fb606a`).
- Second release today, under the security and site-down exception (working rule 13): the artwork fix closes a swap after checking, and the readiness work catches storage, job and backup failures that would take uploads or backups down.

## What shipped
- Storage errors no longer look like missing files: only "not found" reads as missing; wrong keys, a wrong bucket or a network failure are errors (`d582a2c`).
- Readiness: a scheduled job that has never run counts a day after install; a missing `BACKUP_KEY` and a half-set recovery copy are configuration problems; `/api/health` with the cron secret adds `checks.jobs` and fails on any of these (`f28d277`).
- Track artwork is sealed before use: the upload link points at a temporary copy recorded in `uploads`; the server copies it, checks the copy and only then sets the artwork (`3adeb72`).

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck, lint (0 errors) | `readiness-batch` | passed |
| Unit tests | `readiness-batch` | passed (116 files, new: `tests/storage-errors.test.ts`, `tests/job-readiness.test.ts`, `tests/track-art.test.ts`) |
| `check:perms` (desk roles, RLS on 61 tables) | `readiness-batch` | passed |
| `npm audit --omit=dev` | `readiness-batch` | passed (0 vulnerabilities) |
| Production build | `readiness-batch` | passed |
| Playwright e2e | `readiness-batch` | passed (40 of 40) |
| `/api/health` (public liveness) | live, `3adeb72` | passed (`{"ok":true}`) |
| `/api/health` readiness with the cron secret | live | blocked: needs the cron secret, which only Vercel and the owner hold |
| Artwork from a real sender's phone | live | blocked: no test send on the live site; covered by the unit test on local storage |

## Status
- Live: the three changes above, on top of the earlier release today (`6fb606a`).
- If the nightly jobs ever stop, or `BACKUP_KEY` goes missing, the readiness check now fails; nothing pages on it yet (the uptime monitor checks liveness only).

## Rollback
Last good deployment: `dpl_6mSKTUkoYWXXPVD3xndLiqXvb9He` (`6fb606a`). Safe to promote: no migration. Artwork uploads started on this build and finished on the old one would be refused once (the old code looks for the pending key on the track); the sender can try again.

## Next
The Monday admin digest (count a send only when it was delivered), then the docs reconcile and the five-person run.
