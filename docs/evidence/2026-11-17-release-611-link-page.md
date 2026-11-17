# Release: #611, link page one step at a time (17 Nov 2026)

The public send page (option 48): one 560px column, one step at a time, with the retention line kept above Send at the
owner's request. 22 files, +570 −580. Shipped on the owner's "ship it #611" in the Desk (lane:standard), after it had
been on `mobile-next` for the owner's try. The PR was still marked draft although Build and Safety had both called it
ready; the Desk marked it ready for review just before the merge.

| Item | Value |
|---|---|
| PR | #611 |
| Head | `1485f162` |
| Merge commit | `3da19484` |
| Production deploy | 7864848452, success |
| Rollback target | deploy 7863962433 (`4a3a23fe`, #628) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `1485f162` | passed |
| Unit, typecheck, lint, check:perms, `audit:prod` (Build) | `1485f162` | all exit 0 |
| Full e2e | `1485f162` | 125 passed, 1 skipped, 0 failed (15.9 min) |
| Full e2e, before main was merged in | `e49d2a47` | 120 passed, 1 skipped, 0 failed (after Build fixed five specs that matched labels too loosely) |
| Renders (Build) | `e49d2a47` | 44, phone, tablet and desktop, night and day |
| Safety review | `1485f162` | cleared; the main merge changed docs only, and the retention line is back above Send |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/` | production | 200, 200; X-Frame-Options DENY, `Server: Vercel`, no X-Powered-By |

## Other releases since the last code report
- #626, report for #622: merge `a195ca31`, deploy 7863754508.
- #628, Neon agent skills updated from upstream (Markdown and licence only, no hooks or scripts; owner's yes in the
  Desk, lane:owner): merge `4a3a23fe`, deploy 7863962433.

## After the merge
`main` merged into `mobile-next` as `ba4c01e5`, no conflicts.

## Live versus unfinished
Live: the one-column link page. On the test link and waiting for e2e: #610 (receipt, option 49), #609 (Settings,
option 47), #624 (crons every 15 minutes), #627 (live-update checks stop on an idle tab). #627 was tried on
`mobile-next` by the Desk: checks stopped after the idle limit and restarted when the page was used.
