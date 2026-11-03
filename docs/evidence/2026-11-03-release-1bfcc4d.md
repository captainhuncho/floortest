# 3 Nov 2026: a 10 s database connect timeout and one retry when it couldn't connect (#400); fast-lane merge #395

Owner's words in the desk session: in the merge commit. The ask came from the owner in the Safety session ("a database
connect timeout and one retry on connection errors"), after production incidents #38 and #39.

## Build
- Release branch `release-2026-11-03a`, head (checked) `1bfcc4d` = #400 head `1bfcc4d1`, which already contains `main`
  `10c959f` (a fast-forward).
- Contains: #400 (Backend), `lane:standard`. No migrations, no package changes.
- Previous release: #397 (release #398, report `2026-11-02-release-8c06763.md`), merge `dc7fa88`, CodeQL and checks pass,
  deploy success, health ok; `mobile-next` then `bb9facf`.
- Fast-lane merge since: #395 (the previous Overview inside the new ops navigation, owner: "bring back the overview
  page"), head `4462be17` (contains `dc7fa88`), merge `10c959f`, CodeQL and checks pass, deploy success, health ok;
  `mobile-next` `7e6b702`. Build's run at `6e93ff38`: 551/551, e2e 95 passed, 1 skipped (the hidden Overview's test,
  with the reason); later commits added only test files and docs from `main`.
- Safety cleared #400 at `1bfcc4d1`: it retries only errors raised before any query is sent (`CONNECT_TIMEOUT`,
  `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, the database's startup refusals), never after a query may have run, and a
  transaction only if its body never started; a second failure still becomes an incident. Two LOW notes, no change: the
  worst case per request is about 20.5 s (was 30 s), and a recovered blip shows only in the Vercel logs (a counter on
  Ops → Health is an optional follow-up).
- Receipt sealing (plan B11), counted read-only on production at 00:18 UTC: 28 tracks, `token` 28, `token_hash` 28,
  `token_sealed` 0; the 3 Nov 03:30 clean-up had not run yet (the last one was 2 Nov 03:30, before #391).
- This release's merge commit and production deployment go in the next release's report.

## What shipped
- #400: the database client opens connections with `connect_timeout` 10 s and retries once, after a short random wait,
  only when the connection could not be opened; incidents #38 and #39 (a one-off connection failure at the database
  provider, 2 Nov 23:12 UTC, two home-page visits got an error page) would have recovered. Tests for each case.

## Checks
| Check | Result |
|---|---|
| On `1bfcc4d` | typecheck, lint 0 errors, check:perms, `npm test` 559/559, audit 0, e2e 95 passed and 1 skipped (`ops-overview`, kept on purpose by #395) in 11.1 min, no reruns, load about 7; the run took and released `~/.cache/floortest-e2e-slots/slot-1` |
| Sender's run | #400 on `1bfcc4d1`: 559/559, e2e 95 + 1 skip. |

## Rollback
Last good deployment: #395's production deployment (`10c959f`). No migrations and no data changes; an Instant Rollback is
safe.
