# Release: #614, the scanner sleeps when idle (17 Nov 2026)

The virus scanner's container now stops when idle. Node ran as PID 1 and ignored SIGTERM, so Cloudflare could not stop
it: it was awake about 22.5 hours a day, costing about $0.64 a day. 5 files, +128 −3.
Shipped on the owner's "ship it #614" in the Desk (lane:owner: changes the production scanner).

| Item | Value |
|---|---|
| PR | #614 |
| Head | `a857820f` |
| Merge commit | `e00640cc` |
| Production deploy (web app) | 7854919958, success; the app itself has no code change |
| Rollback target | revert the commit and redeploy the Worker; web app deploy 7854738204 (`28d7ec13`, #608) |

## What changed
- `scanner/server.mjs`: SIGTERM/SIGINT handler with a 20 s grace: close the server, stop clamd and freshclam, exit 0.
- `scanner/cloudflare/index.js`: `onActivityExpired` calls `stop()`, then `destroy()` on the next idle check if the
  container is still up. `sleepAfter` stays 10 min; routes, memory and the secret are unchanged.
- `scanner/README.md`, `docs/costs.md`: the cause, and that the fix needs a redeploy.
- `tests/scanner-sleep.test.ts`: the real `server.mjs` exits 0 on SIGTERM; the Worker logic goes stop, destroy, nothing.
  Both fail without the fix.

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `a857820f` | passed |
| `npm test`, typecheck, lint, `check:perms` (Backend) | `a857820f` | 975/975, clean |
| Full e2e | none | not run: the scanner is not part of the app e2e, and the app has no code change |
| Safety review | `a857820f` | passed |
| Health `/api/health` | production | 200 |

## After the merge
`main` merged into `mobile-next` as `ad093d8f` (5 files). Its message reads "Merge main (, #614)": a gh timeout left
the commit id blank. The parents are right (`222aa04a`, `e00640cc`); it was not amended, because it is already pushed.

## Live versus unfinished
- Not live yet: the scanner Worker runs the old code until the owner redeploys it
  (`cd scanner/cloudflare && npx wrangler deploy`).
- After the redeploy, judge it by Cloudflare's Containers metrics and the daily Container Memory cost (expected to fall
  from about $0.64 to cents), not by `/status`.
- Follow-up (Backend): `scannerHealth()` can wake the container while it is "stopping" or "unknown" (found by Safety;
  Build's branch `build/scanner-sigterm`, `9523b39e`).
- Report-only releases since the last code release: #605 (`fe7a0757`, deploy 7851768225), #607 (`a7c80021`, deploy
  7853617308), #608 (`28d7ec13`, deploy 7854738204). #612 (test-only) has its own report.
