# Release: #726, folder menu and delete dialog work fully by keyboard (21 Nov 2026)

The folder ··· menu takes arrow keys, Home and End. The delete dialog opens on Cancel and keeps focus while a delete
runs or is refused. 3 files, +35 −8, UI only, no migrations. Standard lane: the owner said "try it #726" in the Desk,
then "ship it #726".

| Item | Value |
|---|---|
| PR | #726 |
| Head | `4127d435` |
| Merge commit | `4c1f15fa` |
| Production deploy | `dpl_W2gnq3sPQNkdLgetAaC6uaC83ULZ`, ready |
| Rollback target | `dpl_HC5qEzcmM3RihA1LwgUyQEXhhJuz` (`5e16302c`, #724) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `4127d435` | all green before the merge; GitHub CLEAN, not a draft |
| Typecheck, lint, `check:perms`, `audit:prod` (Backend) | `4127d435` | passed |
| Unit | `4127d435` | 1089 passed, 0 failed |
| e2e: full suite | `4127d435` | 134 passed, 1 skipped (the deliberate one), 0 failed, 18.0 min |
| Safety review | `4127d435` | cleared |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #725, report for #724: merge `4ab93e2b`.

## After the merge
`main` merged into `mobile-next` as `532c9127`, no conflicts; preview `dpl_J56ZdF2KzhMZ7QE5j69sWdoL5h6L`, and the test
link points at it.

## Live versus unfinished
Live: as in the #724 report, plus this fix. On the test link, not shipped: the iPhone lock-screen player (#722; e2e
redo and device check before ship). Owner: home Site content edit (board #80) and one more password change (board #86).
