# Release: #613, sent history laid out like an order history (17 Nov 2026)

`/sent` (option 50): asking for the link, "Check your email", and the history grouped by week and month with the
chips All · Listened · Waiting, read in the sender's own time zone. 11 files, +494 −85.
Shipped on the owner's "ship it" in the Desk (lane:standard), after the Desk named #613 as the one ready to ship; the
owner had tried it on `mobile-next`.

| Item | Value |
|---|---|
| PR | #613 |
| Head | `bd75d55c` |
| Merge commit | `57de4eb0` |
| Production deploy | 7862191742, success |
| Rollback target | deploy 7859918433 (`cc958b36`, #619) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `bd75d55c` | passed (ran before advisory GHSA-fc5q-39xc-vjpf was updated at 15:56 UTC) |
| Full e2e | `bd75d55c` | 121 passed, 1 skipped, 0 failed |
| Renders (Build) | `bd75d55c` | 18 of 18: ask, history, expired × 375 / 768 / 1440 × night and day |
| Safety review, two blind reviewers | `bd75d55c` | cleared |
| Owner's try on `mobile-next` | `df82be41` (same patch) | tried before the ship |
| Health `/api/health`, `/sent` | production | 200, 200 |

## Other releases since the last code report
- #619, report for #616: merge `cc958b36`, deploy 7859918433.
- #620, report for #594: merge `8c2e8009`. Its production deploy 7861614368 failed at the migrate step because the
  Neon production project had used its Free plan compute quota (Postgres 53000). The site was down until the owner
  upgraded Neon (back 18:09 UTC). #620 changed one evidence file only; this release's deploy carries it.

## After the merge
`main` merged into `mobile-next` as `8143aed0`, no conflicts.

## Live versus unfinished
Live: the sent history. Open: `npm audit --omit=dev` fails on GHSA-fc5q-39xc-vjpf (build-time only, through
`@sentry/nextjs`); the owner chose a narrow, time-boxed exception, which Backend is building. Neon hours: the cron
and live-update fixes are being built. On the test link: #601, #609, #610, #611.
