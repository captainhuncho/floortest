# Release: #616, scanner health check leaves a sleeping scanner alone (17 Nov 2026)

Follow-up to #614 (found in Safety's review). `scannerHealth()` asked the container's `/health` even while it was
stopping or in an unknown state, which could wake it. Now it asks only a running or healthy container, and "stopping"
reads as asleep. `scannerHealth()` feeds only the detailed report of `/api/health`; the upload path (`scanStored`,
`wakeScanner`) is unchanged. 4 files.
Shipped on the owner's "ship it #616" in the Desk (lane:owner: production scanner).

| Item | Value |
|---|---|
| PR | #616 |
| Head | `050ec2c4` |
| Merge commit | `224447e6` |
| Production deploy (web app) | 7856061507, success |
| Rollback target | deploy 7855872606 (`09717643`, #618); the scanner Worker keeps version 10608f1e until redeployed |

## What changed
- `src/lib/scan.ts`: health is asked only of a running or healthy container. Live with the web deploy.
- `scanner/server.mjs`: one line. Live only after the owner redeploys the `floortest-scanner` Worker.
- `tests/scan.test.ts`, `tests/scanner-health.test.ts`.

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `050ec2c4` | passed |
| `npm test`, typecheck, lint, `check:perms` (Backend) | `050ec2c4` | 976/976, clean |
| Full e2e | none | not needed (Safety): only `/api/health`'s detailed report uses it |
| Safety review | `050ec2c4` | passed |
| Health `/api/health` | production | 200 |

## Scanner Worker
The owner redeployed the Worker today from `e00640cc` (#614): version 10608f1e, image `0e0fcc33`. Since then
`/status` has read `"container":"stopped"` (13:53 and 14:20). The `server.mjs` line from #616 needs one more redeploy.
After that, judge the fix by Cloudflare's Containers metrics and the next day's Container Memory cost, which was about
$0.62 to $0.64 a day before.

## After the merge
`main` merged into `mobile-next` as `6c4d3d67` (4 files).

## Live versus unfinished
- Live: the health-check change.
- Waiting on the owner: the second scanner redeploy, and the cost figures from the Cloudflare dashboard tomorrow.
