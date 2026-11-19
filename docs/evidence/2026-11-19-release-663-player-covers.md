# Release: #663, Players show the track's cover (19 Nov 2026)

The bar player and the expanded player show the track's cover art, with the cover passed in from the Floor, Review,
Prepare, collection and list pages. Added to `main`: 19 files, +178 −28 (`git diff f81a69be 67a51aff`). lane:standard.
Shipped on the owner's "ship it #663" in the Desk, after the owner tried it on `mobile-next` (`74a72c1e`): "I tried
Change cover, folder covers and Send music on the test link: worked" (typed in Safety, 19 Nov; "folder covers" was the
Desk's name for this change).

| Item | Value |
|---|---|
| PR | #663 |
| Head | `9e6f1dc5` |
| Merge commit | `67a51aff` |
| Production deploy | 7909922971, success |
| Rollback target | deploy 7909642655 (`f81a69be`, #671) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `9e6f1dc5` | passed (6/6) |
| Full e2e | `9e6f1dc5` | 130 passed, 1 skipped, 0 failed |
| Merge with `main` | `f81a69be` | GitHub CLEAN, `git merge-tree` clean. One shared file since the branch base `7d23b6b2`: `src/app/dashboard/ReviewPanel.tsx` (the PR adds an import and two lines; `main`'s #661 changes are in other hunks). The combined code was on `mobile-next` when the owner tried it |
| Safety review | `9e6f1dc5` | cleared |
| On `mobile-next` for the owner's try | `9e6f1dc5` (`c889414a`, tried on `74a72c1e`) | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #671, reports for #667 and #668: merge `f81a69be`, deploy 7909642655.

## After the merge
`main` merged into `mobile-next` as `ee0956ad`, no conflicts.

## Live versus unfinished
Live: the played-out read action (#597), the Delete project fix (#667), the callout follow-ups (#668) and the player
covers. Tried by the owner, Safety cleared, ready for the owner's word: Change cover for projects and folders (#669,
migrations 0156 and 0157). Tried by the owner, still a draft: Send music (#662). Next on top of this: the volume reveal,
then the six clearer player buttons. Draft, not yet sent for review: the Activity redesign (#670).
