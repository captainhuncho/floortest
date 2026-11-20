# Release: #680, tap a track to play and pause it on callout and project pages (20 Nov 2026)

On callout and project pages, tapping a track plays it. Tapping the current track pauses it, and tapping it again
resumes it, as in the Review Queue. On the current row, the number becomes a play or pause icon. Enter and Space do the
same as a tap. The New folder sheet says "Folder". The fix in `c677e322` also makes Enter press a focused row button
(Keep, Not for me) instead of opening the track details. Added to `main`: 6 files, +86 −37
(`git diff 525c8b92 565708bf`). Shipped on the owner's "ship it #680" typed in the Desk (lane:standard), after the
owner asked for pause on the current track in the Desk and the change was on `mobile-next` for the owner's try.

| Item | Value |
|---|---|
| PR | #680 |
| Head | `c677e322` |
| Merge commit | `565708bf` |
| Production deploy | 7929867129, success |
| Rollback target | deploy 7924949532 (`525c8b92`, #689) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `c677e322` | passed (6/6) |
| e2e: `tap-to-play.spec.ts` (click and Enter), `collection-panel.spec.ts`, `folders.spec.ts` | `7a141645` (`c677e322` merged with `mobile-next`) | 4 passed, 0 failed (load 18.2 at start, 17.9 at end) |
| Earlier e2e of `tap-to-play.spec.ts` | `261e368d` | 1 failed: Enter on the focused row button opened details instead of resuming. Real bug, fixed in `c677e322` |
| Merge with `main` | `525c8b92` | GitHub CLEAN; merged without conflicts |
| Safety review | `bfc5f72e`, then `c677e322` and `7a141645` | cleared |
| On `mobile-next` for the owner's try | `7a141645` | yes, before the ship; Safety verified the test link |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #689, report for #688: merge `525c8b92`, deploy 7924949532.

## After the merge
`main` merged into `mobile-next` as `b4c4e015`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581), change cover (#669), the receipt limit (#683), the code email (#688) and tap to
play with pause. On `mobile-next` for the owner's try: the Projects page (#675), folder drag and drop (#686), the
compact review card (#681), the volume reveal (#684), the clearer player buttons (#687). Being built: Collections step 1
(option 66, on top of #675) and review card option 1 (on top of #681).
