# Release: #652, Delete account: type DELETE FLOORTEST, no password (18 Nov 2026)

Deleting an account now asks for DELETE FLOORTEST typed exactly, and the two-step code when two-step is on; the
password step is gone. The wording says what happens: the account switches off now, signing in within `UNDO_DAYS`
(14) days restores it, after that it is deleted for good. Deletion has its own rate limit (`delete_step`, 10 an hour).
Added to `main`: 16 files, +227 −55 (`git diff 9bd315f8 502ed90e`). lane:owner. The owner's yes, typed in the Desk:
"For deleting an account: no password, keep the two-step code. Also change the delete wording to match the 14-day
undo." Tried on `mobile-next`: "the delete process works". Shipped on the owner's "ship it #652" typed in the Desk.

| Item | Value |
|---|---|
| PR | #652 |
| Head | `d537f85c` |
| Merge commit | `502ed90e` |
| Production deploy | 7890763431, success |
| Rollback target | deploy 7888256483 (`9bd315f8`, #650) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `d537f85c` | passed (6/6) |
| Typecheck, lint, unit (incl. `tests/delete-account-action.test.ts`, `delete-phrase.test.ts`, `settings-menu.test.ts`), check:perms, `audit:prod` (Build) | `d537f85c` | all passed |
| Full e2e | `d537f85c` | 126 passed, 1 skipped, 0 failed (16.3 min; load 13.3 at start, 10.3 at end) |
| Merge with `main` | `9bd315f8` | GitHub CLEAN; base `449e1a6d`; the only file both sides changed is `docs/product/receiver.md` (merged clean, no markers), so the e2e carries over |
| Safety review, two blind reviewers | `d537f85c` | cleared; both PASS |
| On `mobile-next` for the owner's try | `d537f85c` (`a118d882`) | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None.

## After the merge
`main` merged into `mobile-next` as `ae596ad6`, no conflicts.

## Open for the owner
The privacy policy (`src/app/privacy/page.tsx:119`) and terms (`src/app/terms/page.tsx:72`) do not mention the 14-day
switch-off or the minimal evidence record kept for 6 years after the purge. Legal wording is the owner's; untouched.

## Live versus unfinished
Live: everything in the #650 report, plus Delete account with DELETE FLOORTEST. Ready for the owner's word: the queue
test wait fix (#651), the cover access test (#653), and reports #647, #648, #649, #654; #645 waits for its wording
fix. On `mobile-next` for the owner's try: the expanded player (#600, `3642f514`; full e2e owed, phone layout change
pending).
