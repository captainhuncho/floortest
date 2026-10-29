# 29 Oct 2026: next and previous tracks load in the background (PR #51, 231bfa5)

## Build

- Production: `main` `231bfa5` (merge of PR #51, head `42d9e62`), deployment `dpl_G7NiSSkuNrJNt3RWqbKExx48T3EJ`, READY.
- Preview: `mobile-next` `2360c72` (the same change merged onto the preview branch), then `cc0772b` after main was merged
  back (same files as `main`).
- Second code release on 29 Oct, after floor-r15 (`674be1d`). The owner chose to ship it today, knowing the
  one-release-a-day rule; it is not a security, data-loss or site-down fix.

## What shipped

- `42d9e62` Review Queue: while a track is open, the next and previous tracks load in full in the background
  (`src/app/dashboard/DecisionRail.tsx`, `router.prefetch` with `PrefetchKind.FULL`), and again after a decision
  refreshes the desk. Moving to them shows their details (message, sender, tags) without waiting on London.
  `docs/03-app-flow.md` says so.
- Evidence-only releases since the last report, listed here instead of reported on their own:
  - PR #47 (rule 13: evidence-only releases get no report), merge `ff38f43`, deployment `dpl_KNtExuzpibwfoDSnuoHDgbFuraxJ`.
  - PR #50 (floor-r15's report), merge `193efe1`, deployment `dpl_7hi7BsgugfWxTDJr7gTrriRt7Zpo`.

## Checks

| Check | Build | Result |
|---|---|---|
| Timing, before | local production build of `main` `ff38f43`, 201 waiting tracks | passed: J shows the next track at once (floor-r15) and asks the server for its page; details arrive when it answers (134 ms locally; about 0.4–0.6 s more from Ghana, `docs/02-technical.md`) |
| Timing, after | local production build of `42d9e62`, same data | passed: after one move, J opens the next track from the prefetched page with no request for it; only the following track loads in the background |
| First move right after opening the page | local production build of `42d9e62` | blocked: the browser pane was hidden, so the page ran as a background tab and idle-time prefetching waited; needs a check on a visible phone |
| Keep / Not for me still save and move on | local production build of `1ca38b3` (same effect, before floor-r15) | passed: two Keeps took the count from 203 to 201 and moved to the next track |
| typecheck, lint (0 errors), unit tests | `42d9e62` | passed, 191/191 |
| `npm run check:perms`, `npm audit --omit=dev` | `42d9e62` | passed (65 tables), 0 vulnerabilities |
| e2e | `42d9e62` (dev server) | passed, 50/50; e2e runs on the dev server, where Next.js never prefetches, so it shows nothing broke but cannot test the speed-up |
| GitHub CI "checks" | `42d9e62` | passed (4m27s); CodeQL and dependency review skipped (gated off) |
| Live after the deploy | `231bfa5` | passed: `https://floortest.app/` 200, `/api/health` 200, `X-Frame-Options: DENY` and CSP present |
| Sessions | | go from FLOORTEST and Produce Design |

## Status

- Live: next and previous tracks prefetch in full on the Review Queue.
- Unchanged: Keep and Not for me still take two trips (the decision, then the next page), and each decision is
  followed by about 40 background reloads (every tab, sidebar link and visible row) because `done()` revalidates the
  whole dashboard. Opening a row from the list still waits on London.
- Not measured from Ghana: the timings are local; the owner's phone is the real check.

## Rollback

Last good deployment: `dpl_7hi7BsgugfWxTDJr7gTrriRt7Zpo` (`193efe1`). No migration, so rolling back is safe.

## Next

Make Keep and Not for me one trip, and stop the burst of reloads after each decision.
