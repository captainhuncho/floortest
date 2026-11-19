# Release: #610, receipt laid out like a payment receipt (17 Nov 2026)

The sender's private receipt (option 49): status centred on top, then the track and its steps; the action sits in a bar
pinned at the bottom on phones and in the page from 640px; the code screen is short and centred. 13 files, +418 −168.
Shipped on the owner's "ship it #610" in the Desk (lane:standard), after it had been on `mobile-next` for the owner's
try. The PR was still marked draft; the Desk marked it ready for review just before the merge.

| Item | Value |
|---|---|
| PR | #610 |
| Head | `2cf3d9a3` |
| Merge commit | `c1daba2b` |
| Production deploy | 7865184170, success |
| Rollback target | deploy 7864942749 (`922786e4`, #629) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `2cf3d9a3` | passed |
| Unit, typecheck, lint, check:perms, `audit:prod` (Build) | `2cf3d9a3` | all exit 0 |
| Full e2e | `2cf3d9a3` | 126 passed, 1 skipped, 0 failed (16.1 min) |
| Full e2e, before main was merged in | `c8a059d8` | 121 passed, 1 skipped, 0 failed |
| Renders (Build) | `c8a059d8` | 96; they carry over because the later main merge changed no `src/` |
| Safety review | `2cf3d9a3` | cleared; the main merge's one conflict (`docs/product/sender.md`) keeps both paragraphs, #610's receipt and #613's `/sent` |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/` | production | 200, 200 |

## Other releases since the last code report
- #629, report for #611: merge `922786e4`, deploy 7864942749.

## After the merge
`main` merged into `mobile-next` as `016d0246`, no conflicts. Earlier, putting #609 on `mobile-next` for the owner's
try, the Desk resolved a one-line conflict in `docs/03-app-flow.md` in a way that replaced the whole file; `dda4ab5f`
put the other lines back, and Safety confirmed the file then differed from the intended merge by #609's menu line only.

## Live versus unfinished
Live: the receipt layout. On the test link: #609 (Settings, option 47; e2e running), #624 (crons every 15 minutes) and
#627 (live-update checks stop on an idle tab), both waiting for e2e.
