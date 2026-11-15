# 15 Nov 2026: Deleted accounts with a 14-day undo (#555, #560)
Owner's word in the desk session: "try it #555 #560", then "delete and restore work" after testing on the test link.
`lane:owner` (deletions, sign-in, retention). The merge runs on the owner's "ship it" for this release PR.

## Build
- Release branch `release/deleted-accounts-555-560` off `main` `ea012403`, merging `3a5bd043` (#560, Backend, which
  holds #555 `2225dfcb`), plus this report. Merge commit `3de1bbdd`, no conflicts.
- Safety: #555 passed a double blind review at `fdfb8110` (both PASS); #560 passed one at `3770c059`. Safety then
  verified the heads merged with `main`: `2225dfcb` and `3a5bd043` match the reviewed diffs file by file, plus one
  new test (a purged account's Terms rows keep `account_deleted_at`).
- Test link: `mobile-next` `3ca0d1ab` held `3a5bd043` from the owner's "try it #555 #560".
- Migration 0150: adds only. No data is dropped or rewritten.
- Packages: none added or changed.
- Previous releases, not yet recorded in a report of their own: #561 (report for #554), merge `ea012403`, production
  deploy 7811253204 success. #554's report is `2026-11-15-release-collections-menu-024dea01.md`.

## What shipped
- Deleting an account from Settings signs the person out at once and holds the account for 14 days. Signing in
  within those 14 days opens a Restore page that brings the account back. After 14 days the account is removed.
- An admin deleting an account for a privacy request uses the same 14 days (owner, 15 Nov: "Yes, 14 days").
- An admin can suspend an account during the 14 days; Restore is then refused.
- Terms acceptance records outlive a removed account: the nightly clean-up stamps `account_deleted_at`, and the
  6-year keep runs from removal.
- Docs: `SECURITY.md`, `docs/05-data.md`, `docs/product/receiver.md`.
- 31 files against `main`, 875 lines added and 50 removed, plus this report.

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck | `3de1bbdd` | passed |
| Lint | `3de1bbdd` | passed (0 errors) |
| Unit tests | `3de1bbdd` | passed (939/939) |
| check:perms | `3de1bbdd` | passed |
| npm audit --omit=dev | `3de1bbdd` | passed (0 vulnerabilities) |
| e2e (full) | `3de1bbdd` | passed (111 passed, 1 skipped, 0 failed) |
| e2e (full), Backend | `3a5bd043` | passed (111 passed, 1 skipped, 0 failed) |
| Safety double blind review | `fdfb8110`, `3770c059` | passed |
| Safety delta verification | `2225dfcb`, `3a5bd043` | passed |
| Owner test on the test link: delete, restore | `3ca0d1ab` | passed ("delete and restore work") |
| Owner test: admin suspend refuses Restore | `3ca0d1ab` | not reported by the owner; covered by unit tests |
| CI | release PR | see PR checks |

## Status
- Built and tested: everything above.
- Live: not yet; goes live when this PR merges.
- Unfinished: no reader for deletion evidence yet; backups age out on their own schedule; the Privacy Policy wording
  for deletion and the 14 days is the owner's or the lawyer's.

## Rollback
- Last good deployment: production 7811253204 (`main` `ea012403`).
- Rolling back restores code, not data. 0150 only adds, so the old code runs on the new schema. The old code doesn't
  know 0150's columns, so accounts deleted while the new code ran may act as normal accounts again after a rollback
  until it is re-shipped.

## Next
#562 (Terms required everywhere) after Safety's review and the owner's test.
