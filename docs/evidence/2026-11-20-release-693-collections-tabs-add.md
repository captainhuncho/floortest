# Release: #693, Collections in two tabs with one + Add menu (option 66, step 1) (20 Nov 2026)

Collections now has two tabs, Callouts and Projects, kept in `?tab=`; they replace All / Callouts / Projects.
`/dashboard/projects` redirects to `?tab=projects`, and old `?kind=callouts` links still open Callouts. Each tab has one
+ Add: a floating pill on phones, a button in the tab header from 768px. Callouts offers Callout and Folder; Projects
offers Import, Project and Folder. Inside a folder + Add stays, without Folder, and a new item lands in that folder.
The New folder sheet and the old New folder / Upload audio buttons are gone. No migrations, no new packages, and who may
create or file collections is unchanged. Added to `main`: 22 files, +456 −321 (`git diff a83392aa 5abfab95`). Shipped
on the owner's "ship it #693" typed in the Desk (lane:standard), after it was on `mobile-next` for the owner's try.

| Item | Value |
|---|---|
| PR | #693 |
| Head | `36a7bb83` |
| Merge commit | `5abfab95` |
| Production deploy | 7941194137, success |
| Rollback target | deploy 7940269489 (`a83392aa`, #701) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `36a7bb83` | passed (6/6) |
| Typecheck, lint (0 errors), unit (1086/1086), check:perms, `audit:prod` (Collections session) | `36a7bb83` | all passed |
| e2e: full suite | `36a7bb83` | 132 passed, 1 skipped, 0 failed (16.0 min; load 13.1 at start, 235.7 at end). The skip is the deliberate one at `ops-overview.spec.ts:49` |
| Earlier e2e on `360d55b2` | `360d55b2` | teams 4, batch 3, folders 2, no-collection 2 passed; `folder-drop.spec.ts` failed because it waited for the removed "Upload audio" button. `36a7bb83` changes only that spec to wait on + Add; it passed alone and in the full suite |
| Safety review | `36a7bb83` | cleared |
| Merge with `main` | `a83392aa` | GitHub CLEAN; merged without conflicts |
| On `mobile-next` for the owner's try | `f0cc4d72` | yes, before the ship; Safety verified that merge |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #699, the goal adds the iPhone app (docs): merge `d67855ad`, deploy 7938051869 (report #701).
- #701, report for #699: merge `a83392aa`, deploy 7940269489.

## After the merge
`main` merged into `mobile-next` as `a907aa0b`, no conflicts.

## Live versus unfinished
Live: as in the #684 report, plus the iPhone goal and Collections step 1. Ready for the owner: the RevenueCat plugin
(#706) and the push notifications plugin (#703), which touch the same `mobile/` files, so the second needs `main` merged
in; the StoreKit test setup (#705, draft). On `mobile-next` for the owner's try: the clearer player buttons (#687, player
specs 6/6 on `54305c60`, full e2e next), the compact review card (#681, updated with `main`, waiting for e2e) and
review card option 1 (#691, conflicting with `main`). Waiting for the
owner's try: hiding the web checkout in the phone app (#702). Blocked: PostHog analytics (#704), which failed blind
review. Waiting for e2e: desk folders admin-only writes (#695).
