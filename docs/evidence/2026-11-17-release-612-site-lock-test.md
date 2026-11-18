# Release: #612, site-lock unit test warm-up (17 Nov 2026)

Test-only. `tests/site-lock.test.ts` now runs `SELECT 1` before the first `gateLock` read, so the first read no longer
counts the cold database start against the 1.5 s limit. That first read took 9 to 14 s locally and failed every full
`npm test`, `main` included. The app's `LOCK_READ_TIMEOUT_MS` (1500) is unchanged. 1 file, +4.
Shipped on the owner's "ship it #612" in the Desk.

| Item | Value |
|---|---|
| PR | #612 |
| Head | `12783a69` |
| Merge commit | `14b8f13b` |
| Production deploy | 7853529198, success |
| Rollback target | deploy 7851768225 (`fe7a0757`, #605) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `12783a69` | passed |
| Full e2e | none | not needed: test-only change, no app code |
| Safety review | `12783a69` | cleared; merge verified after |
| Health `/api/health` | production | 200 |

## After the merge
`main` merged into `mobile-next` as `2eb50255` (the same one file).

## Live versus unfinished
Live: nothing visible changes for users. Full local `npm test` runs pass again for every session.
