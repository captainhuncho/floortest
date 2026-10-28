# 28 Oct 2026: backup key replaced, vault run and restore drill

## Build

- Production: `c53b6a0`, redeployed as `dpl_AJ9E6AuZsDMkV724phK55qzyyLAa` (READY) to pick up the new `BACKUP_KEY`. No code change.
- Drill script fix: branch `fix-restore-drill-seeded` from `mobile-next` (`scripts/restore-drill.ts`).

## What happened

1. The drill on the nightly `db-2026-10-28T0330` couldn't run: the owner no longer had `BACKUP_KEY`, and Vercel stores it as Sensitive, so it can't be read back.
2. Owner made a new key on their own Mac (`openssl rand -base64 32`, straight to the clipboard, never shown), saved it in the password manager, set it in Vercel and redeployed production. `BACKUP_OLD_KEYS` stays empty: the old key is gone.
3. Owner pressed Back up now: `db-2026-10-28T1000` (26.8 kB) landed in `floortest-vault`.
4. First drill run: the key opened the backup; 29 tables restored, then `plans` stopped with `23505` (duplicate key). Cause: a migration seeds the default plans in the throwaway database, and the backup holds the same rows. Fix: the drill empties each table before loading it. Shown red then green on a synthetic backup sealed with a throwaway key (old script `23505`, fixed script "restores cleanly").
5. Second drill run with the fix: clean.

## Checks

| Check | Result |
|---|---|
| New key opens a vault backup made by production | passed |
| Restore drill, `db-2026-10-28T1000`, throwaway in-memory database | passed: 49 of 49 tables, row counts match (e.g. tracks 19, senders 5, users 3, vault_copies 22, file_digests 22, outbox 123) |
| Vault bucket `floortest-vault` | 37 objects, 255 MB (database backups and file copies) |
| Live site after the redeploy | `/` 200, `/api/health` ok |

## Status and what it costs

- **Working:** nightly backups at 03:30 UTC are sealed with the new key and can be restored.
- **Lost:** backups made before 28 Oct 10:00 UTC were sealed with the old key and can't be opened. They age out by 11 Nov. The live database is untouched; Neon's point-in-time restore and the vault's file copies don't depend on this key.
- **Key keeping:** the new key is in the owner's password manager only, never in the repo, chat or logs. Keep a second copy outside Vercel.
- **Seen on the way, not fixed here:** Ops → Security counts desk sign-in failures only; failed ops sign-ins (`ops_fail_email`, `ops_fail_ip`) aren't shown. The owner's authenticator codes for ops didn't match; a recovery code worked; set up two-step again.

## Rollback

- Nothing to roll back in production. The drill script change only affects the owner-run drill.
