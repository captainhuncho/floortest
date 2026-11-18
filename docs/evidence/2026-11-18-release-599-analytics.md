# Release: #599, Analytics laid out as drawn in option 41 (18 Nov 2026)

The Analytics page as drawn in option 41. A track kept on a day with no new arrivals now shows in the bars (the bug found
during review, fixed in `badcf64b`). Added to `main`: 7 files, +357 −166 (`git diff 2396ef37 91b8a3d3`); the PR's 21
files, +923 −617 include #596's Floor work, which shipped with #596. Shipped on the owner's "ship it #599" in the Desk
(lane:standard), after the owner tried it on `mobile-next` with Floor, Prepare and Collections covers: "They look good,
close to the design."

| Item | Value |
|---|---|
| PR | #599 |
| Head | `badcf64b` |
| Merge commit | `91b8a3d3` |
| Production deploy | 7870972952, success |
| Rollback target | deploy 7870823611 (`2396ef37`, #596) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `badcf64b` | passed (6/6) |
| Full e2e | `badcf64b` | 126 passed, 1 skipped, 0 failed (15.7 min, load 12.9 at start, 15.1 at end) |
| Merge with `main` | `2396ef37` | `git merge-tree` clean (Build and Safety), so the head and its e2e stay valid |
| Safety review | `badcf64b` | cleared, including the chart fix |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/` | production | 200, 200 |

## Other releases since the last code report
None. The report for #596 (#636) is cleared and waiting for the owner's word.

## After the merge
`main` merged into `mobile-next` as `bfba143b`, no conflicts.

## Live versus unfinished
Live: Floor (#596) and Analytics. Prepare (#606): tried by the owner; Build merged `main` in to fix a docs conflict
(`f83cddf2`, docs only) and Safety checks it before the owner's word. Collections covers (#621) ships after Prepare and
needs a fresh Safety check then. Settings (#609) is lane:owner and needs the owner's yes in the Desk. e2e queue next:
sign-in screens (#617), the e2e test fix (#635), Review Queue (#601), coming-soon page (#625). On hold: expanded player
(#600).
