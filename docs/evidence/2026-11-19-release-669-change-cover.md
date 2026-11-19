# Release: #669, Change cover for projects and folders (19 Nov 2026)

Owners can change the cover of a project or folder. Added to `main`: 18 files, +509 −33
(`git diff 364a59ad e1b2a9f5`). Includes migrations 0156 and 0157 (additive; a Vercel rollback leaves them in place,
which is harmless). Shipped on the owner's "ship it #669" in the Desk (lane:standard), after the owner's "try it #669"
on `mobile-next`.

| Item | Value |
|---|---|
| PR | #669 |
| Head | `1829664f` |
| Merge commit | `e1b2a9f5` |
| Production deploy | 7913186879, success |
| Rollback target | deploy 7912086954 (`364a59ad`, #682) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `1829664f` | passed (6/6) |
| Unit (Build) | `1829664f` | 1068 passed, 0 failed |
| e2e: `folders.spec.ts`, `collection-panel.spec.ts`, `batch.spec.ts` (upload and deletion paths) | `1829664f` | 6 passed, 0 failed |
| Merge with `main` | `f8b24141` | merged into the branch as `1829664f`; GitHub CLEAN |
| Safety review | `1829664f` | cleared |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None.

## After the merge
`main` merged into `mobile-next` as `d6cd0fba`, no conflicts. GitHub reported one open high Dependabot alert on
`main` at push time; passed to Safety.

## Live versus unfinished
Live: Change cover. Ready for the owner's word: receipt limit (#683). Try-it candidates, Safety cleared: volume reveal
(#684), Contacts (#679). On `mobile-next`, e2e running: tap to play and Folder rename (#680), compact review card (#681).
