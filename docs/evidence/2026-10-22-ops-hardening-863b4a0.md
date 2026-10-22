# 22 Oct 2026: admin digest retry, webhooks once, job lease, backup key names

## Build
- Production: `main` at `863b4a0`, deployment `dpl_28ALJ9taL3SLgUwp9ef3ZNmjqyoJ`, READY. Branch `ship-1022` from `main` (`3adeb72`) with `admin-digest-retry` and `ops-hardening-1021` merged in.
- Preview: `mobile-next` already had the same changes; `main` merged into it after the ship.

## What shipped
- The Monday admin digest counts as sent only when every admin's copy is delivered; a failed copy is retried on the next daily run, to that admin only (`6ab8566`).
- Resend delivery reports are acted on once: recorded by event ID in `webhook_receipts` (migration `0097`) in the same transaction as their changes (`f279094`).
- The purge and digest jobs never run twice at once: a 6-minute lease in `app_state`; a crashed run frees it after 6 minutes (`8db0b2c`).
- Backups name the key that sealed them (format FTB2); `BACKUP_OLD_KEYS` keeps earlier keys after a change; older backups still open (`675a6ee`).

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck, lint (0 errors) | `ship-1022` | passed |
| Unit tests | `ship-1022` | passed (120 files, new: `tests/admin-digest.test.ts`, `tests/ops-hardening.test.ts`) |
| `check:perms` (desk roles, RLS on 62 tables) | `ship-1022` | passed |
| `npm audit --omit=dev` | `ship-1022` | passed (0 vulnerabilities) |
| Migrations from empty, including `0097_webhook_receipts`; production build | `ship-1022` | passed |
| Playwright e2e | `ship-1022` | passed (40 of 40) |
| Deploy (runs migrations) and `/api/health` | live, `863b4a0` | passed (READY, `{"ok":true}`) |
| A real Resend webhook recorded once | live | blocked: needs a real bounce or a test event from the Resend dashboard (owner) |
| Tonight's backup in the new format, restored with `scripts/restore-drill.ts` | live | blocked: after tonight's 03:30 UTC run, needs `BACKUP_KEY` (owner) |

## Status
- Live: the four changes above. Backups from tonight on are FTB2; older ones still open.
- Changing `BACKUP_KEY` is now safe: put the old key in `BACKUP_OLD_KEYS` for 14 days.

## Rollback
Last good deployment: `dpl_46bX6QctcWKu61VJB62ehNT1vANf` (`3adeb72`). Safe to promote: migration 0097 only adds a table the old code never reads. One catch: the old code can't read FTB2 backups made after this ship; restore those with this build's `scripts/restore-drill.ts`.

## Next
The shared file-access check (audio, download, offline and app routes), then the five-person run once the owner names the testers.
