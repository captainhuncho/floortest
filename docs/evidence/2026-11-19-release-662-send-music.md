# Release: #662, Send music: who it's for first, then the form (option 58 A) (19 Nov 2026)

The Send music page puts who the music is for first, then the form (option 58 A). Added to `main`: 11 files, +448 −266
(`git diff 67a51aff 568c6c34`). lane:standard. Shipped on the owner's "ship it #662" in the Desk, after the owner tried
it on `mobile-next` (`74a72c1e`): "I tried Change cover, folder covers and Send music on the test link: worked" (typed
in Safety, 19 Nov). The PR was marked ready on the owner's yes typed in the Send music session.

| Item | Value |
|---|---|
| PR | #662 |
| Head | `8140e794` |
| Merge commit | `568c6c34` |
| Production deploy | 7911238859, success |
| Rollback target | deploy 7909922971 (`67a51aff`, #663) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `8140e794` | passed (6/6) |
| Typecheck, lint (0 errors), unit (1052), check:perms, `audit:prod` (Send music session) | `8140e794` | all passed |
| Full e2e | `8140e794` | 128 passed, 1 skipped, 0 failed |
| Merge with `main` | `67a51aff` | GitHub CLEAN, `git merge-tree` clean. The branch is based on `502ed90e`, 91 commits behind; shared files since then: `src/app/globals.css` (the PR adds 7 new lines in a separate place from `main`'s additions) and `docs/product/receiver.md`. The combined code was on `mobile-next` when the owner tried it |
| Safety review | `8140e794` | cleared |
| On `mobile-next` for the owner's try | `8140e794` (`4464eeb0`, tried on `74a72c1e`) | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None (the #663 report is in the same PR).

## After the merge
`main` merged into `mobile-next` as `c06e16a4`, no conflicts.

## Live versus unfinished
Live: the player covers (#663) and the new Send music page. Held from the ship: Change cover for projects and folders
(#669), which changes uploads and deletion and needs its e2e (folders, collection panel, batch) on a head with `main`
merged in. Next: the volume reveal, then the six clearer player buttons. Server only, waiting for Safety and CI:
tap-speed limits in one query (#676). Drafts, not yet sent for review: Activity (#670), Referrals (#673), Plans and
checkout (#674), Projects (#675).
