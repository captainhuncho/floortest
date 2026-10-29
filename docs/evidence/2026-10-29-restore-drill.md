# 29 Oct 2026: restore drill on the nightly vault backup

## Build

- Production at the time of the backup: `ed4f135`. No code or production change in this drill.
- Drill script: `scripts/restore-drill.ts` as on `main` and `mobile-next` (includes the 35fe9f2 fix that empties seeded tables before loading).

## What happened

1. Downloaded the nightly `backups/db-2026-10-29T0330.json.gz.enc` from `floortest-vault` with `wrangler r2 object get --remote` (27,975 bytes, in line with 28 Oct's 26.8 kB).
2. The owner typed `BACKUP_KEY` hidden in a local Terminal tab (`read -s`, cleared after the run); the key never appeared on screen, in chat or in logs.
3. The drill opened the backup and rebuilt it in a throwaway in-memory database. It never touched production or `./data`.

## Checks

| Check | Result |
|---|---|
| Nightly backup at 03:30 UTC exists in the vault | passed: `db-2026-10-29T0330`, created 2026-10-29T03:30:24Z |
| Current key opens a backup made by production | passed |
| Restore drill, throwaway in-memory database | passed: 49 of 49 tables, 551 rows, every row count matches ("restores cleanly") |
| Main row counts | tracks 20, vault_copies 20, file_digests 21, senders 5, users 3, collections 4, outbox 129, account_log 138, admin_log 85, events 58, incidents 36 |
| Vault bucket `floortest-vault` | 37 objects, 254 MB (database backups and file copies) |

## Status

- **Working:** the nightly backup is made on time, sealed with the 28 Oct key, and restores cleanly. Every track has a vault copy row (20 of 20).
- **Not checked here:** opening the audio files in the vault one by one; the bucket's size and the 20 vault copy rows are the evidence they are there.
- **Next drill:** due by 28 Nov, or after the next schema change.

## Rollback

- Nothing to roll back: the drill only reads a backup.
