# Release: #635, steadier e2e runs (18 Nov 2026)

Test-only change: the e2e seed marks the one-time feedback ask as already answered for accounts that exist at seed
time, the Playwright config passes that setting, and `e2e/batch.spec.ts` waits for the upload page to be ready. No
change to what users see. Added to `main`: 3 files, +13 −3 (`git diff 449e1a6d ad759d19`). Shipped on the owner's
"ship it #635" typed on its own in the Desk (lane:standard), after #642, as planned.

| Item | Value |
|---|---|
| PR | #635 |
| Head | `d466e97e` |
| Merge commit | `ad759d19` |
| Production deploy | 7883450643, success |
| Rollback target | deploy 7883222346 (`449e1a6d`, #625) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `d466e97e` | passed (6/6) |
| Unit (1036/0), typecheck, lint, check:perms (Build) | `d466e97e` | all passed |
| Full e2e | `d466e97e` | 126 passed, 1 skipped, 0 failed, 0 flaky (15.8 min; load 15.6 at start, 8.0 at end) |
| Earlier full e2e, before `main` was merged in | `17766f77` | 126 passed, 1 skipped, 0 failed |
| Merge with `main` | `678508df`, then `449e1a6d` | merged into the branch as `d466e97e`, no conflicts; against `449e1a6d` `git merge-tree` clean with no file touched by both |
| Safety review | `17766f77`, then `d466e97e` | cleared |
| Owner's try | | not needed: test-only |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None merged. The reports for #642 (#645) and #625 (#646) are open.

## After the merge
`main` merged into `mobile-next` as `28c740da`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581), the feedback ask fix (#642), the coming-soon day glass (#625) and the steadier
e2e runs. On `mobile-next` for the owner's try, e2e passed: Review Queue keeps its place (#601), the sign-in day glass
(#641). Being fixed after a failed e2e: the expanded player (#600). Next build: wave detail (build/wave-rms).
