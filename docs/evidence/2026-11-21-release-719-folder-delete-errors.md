# Release: #719, a failed folder delete says why (21 Nov 2026)

Sam found that deleting a folder in Collections could fail silently: the dialog closed and the folder stayed. Now the
delete dialog stays open and shows why the delete failed, and on success the folder list refreshes without a reload.
Changed: `src/app/dashboard/collections/Folders.tsx` and `e2e/folders.spec.ts`, +52 −3. No migrations. The owner
said "try it #719" in the Desk (on `mobile-next` as `da8718c1`), then "ship it #719" (lane:standard).

| Item | Value |
|---|---|
| PR | #719 |
| Head | `4f833855` |
| Merge commit | `3a6c1913` |
| Production deploy | `dpl_xr23K16cBZdgnHBmP8G6guKKUKGY`, ready |
| Rollback target | `dpl_5Jpy1wbyzZE5YvYgNxi5eFyS5oQk` (`30c207e8`, #717) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `4f833855` | passed; GitHub CLEAN |
| Typecheck, lint (Backend session) | `4f833855` | passed |
| e2e: `e2e/folders.spec.ts` | `4f833855` | 3 passed (26.1 s; load 17.2 at start) |
| Unit | `4f833855` | 1089 of 1089 passed |
| e2e: full suite | `4f833855` | 134 passed, 1 skipped (the deliberate one), 18.1 min; load 16.3 at start, 52.9 at end |
| Safety review | `4f833855` | cleared |
| Sam's click-through on the test link | `da8718c1` | partial: one run (in a browser pane already signed in to the preview) passed journey 1, a normal delete closes the dialog and refreshes the list; it was stopped before the failed-delete, device and theme checks. A second run could not sign in (no test account, no email on previews). Leftover preview folder "Sam test B" |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- None; the #717 report is #718, not merged yet.

## After the merge
`main` merged into `mobile-next` as `7efe56ad`, no conflicts; the test link points at it.

## Live versus unfinished
Live: as in the #717 report, plus this fix. Open: a preview sign-in for Sam's click-throughs (board). Waiting: the
StoreKit test setup (#705, draft). Conflicting with `main`: #691 and #674.
