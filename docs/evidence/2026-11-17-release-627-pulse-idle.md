# Release: #627, an open page stops checking for changes when nobody uses it (17 Nov 2026)

The desk and the receipt check for new tracks and steps on a timer. Before, an open tab checked every 10 seconds (the
receipt every 8) for as long as it stayed open, which kept the Neon production database awake. Now the checks slow down
when nothing changes (30 s after 3 unchanged checks, 60 s after 6) and stop after 5 minutes with no input. Using the page
or bringing the tab back into view checks at once and restarts the timer. 4 files, +232 −12. Shipped on the owner's
"ship it #627" in the Desk (lane:standard), after it had been on `mobile-next` for the owner's try. An earlier
"ship it #627" could not run because #624's release left a docs conflict; Backend resolved it and Safety re-cleared the
new head.

| Item | Value |
|---|---|
| PR | #627 |
| Head | `3f41d7e9` |
| Merge commit | `f9f5c67b` |
| Production deploy | 7868907431, success |
| Rollback target | deploy 7868132358 (`216039a7`, #624) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `3f41d7e9` | passed |
| Unit, typecheck, lint, check:perms, `audit:prod` (Backend) | `3f41d7e9` | all exit 0, 1005/1005 tests |
| e2e: floor-live and receipt-proof | `4997efcc` | 10 passed, 0 failed; Safety agreed it stands for `3f41d7e9` (docs-only main merge, code patch-ids unchanged) |
| Safety review | `4997efcc`, then `3f41d7e9` | cleared; the conflict in `docs/02-technical.md` keeps both rows, #624's Scheduled jobs and #627's Live updates |
| Desk browser check on `mobile-next` | | checks at 0, 10 and 41 s, none for about 6.5 minutes on an idle tab, then every 10 s after input |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/` | production | 200, 200 |

## Other releases since the last code report
None. The report for #624 (#631) is cleared and waiting for the owner's word.

## After the merge
`main` merged into `mobile-next` as `09ca938a`, no conflicts. Before that, `mobile-next` took #600 (`7d39e63c`) as
`343af44c` for the owner's try; Safety checked the one hand-resolved docs line.

## Live versus unfinished
Live: checks slow down and stop on an idle tab. Ready for the owner's word: #631 (report for #624) and #609 (Settings,
lane:owner, needs the owner's yes in the Desk). On the test link for the owner's try: #600 (player and menu pair).
e2e running or queued: #596, #606, #621, #599, #601.
