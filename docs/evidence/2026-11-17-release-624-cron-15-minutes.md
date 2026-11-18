# Release: #624, scheduled jobs every 15 minutes (17 Nov 2026)

The cron jobs that ran every 10 minutes now run every 15 minutes, so the Neon production database can sleep between
runs and use fewer compute hours. Emails waiting in the queue go out within 15 minutes (the batch), and the receipts and
send-page copy say "up to 20 minutes". 22 files, +50 −33. Shipped on the owner's "ship it #624" in the Desk
(lane:standard), after it had been on `mobile-next` for the owner's try. An earlier "ship it #624" could not run because
the PR had a conflict after #610 and #611 shipped; the owner sent it again once the conflict was fixed and re-checked.

| Item | Value |
|---|---|
| PR | #624 |
| Head | `e5279d4f` |
| Merge commit | `216039a7` |
| Production deploy | 7868132358, success |
| Rollback target | deploy 7865285836 (`8c2af50c`, #630) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `e5279d4f` | passed |
| e2e (the specs the change touches) | `e5279d4f` | 6 passed, 0 failed |
| Safety review | `e5279d4f` | cleared; `4ff8da18` (main merged in) missed two doc lines, `e5279d4f` fixed them |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/` | production | 200, 200 |

## Other releases since the last code report
- #630, report for #610: merge `8c2af50c`, deploy 7865285836.

## After the merge
`main` merged into `mobile-next` as `af44de74`, no conflicts. This also corrects the last "10-minute email queue" line
in `docs/03-app-flow.md` on `mobile-next`. Before the ship, `mobile-next` took #627's cleared head `4997efcc` as
`97b1f0ff` for the owner's try (no file change).

## Live versus unfinished
Live: cron jobs every 15 minutes. Ready for the owner's word: #627 (live-update checks stop on an idle tab) and #609
(Settings, option 47). In progress: #600 (player and menu pair, full e2e running), #596 and #606 (e2e next), #599
(chart bug being fixed: a track kept on a day with no arrivals did not show in the bars).
