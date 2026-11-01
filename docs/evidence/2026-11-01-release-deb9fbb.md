# 1 Nov 2026: replies, notes and collections run under the per-person rules (#282, #285)

Owner's words in the desk session: "ship it" (given after the desk named #282 + #285 as the next ship, before the checks
finished; the desk merges only once they pass).

## Build
- Release branch `release-2026-11-01g`, head (checked) `deb9fbb` = `main` `67982df` + #285 head `8d2942e`, which is
  stacked on #282 head `6daf1c0`.
- Contains: #282 at `6daf1c0` and #285 at `8d2942e` (both Safety), `lane:standard`.
- Previous release: #277 (release #283, report `2026-11-01-release-92b0fea.md`), merge `67982df`, deployment
  `dpl_6Kk5t98JvVwvYj31BS51yPaTWWAh`, health ok; every CI job passed before that merge.
- Migration: `0118_person_held_reply_ids`, runs on production in `vercel-build` when this ships.
- This release's merge commit and production deployment go in the next release's report.

## What shipped
- #282, `src/app/dashboard/actions/review.ts`: notes and held replies run as the person (`asPerson`); a reply that
  goes out runs through `asSystem` after the sender and track are found as the person.
- #282, migration 0118: `grant usage` on `held_replies`' id sequence to `ft_person`. A grant only, no data change.
  `held_replies.id` comes from a plain sequence, so without it a member's held reply would fail
  ("permission denied for sequence") once it runs as the person.
- #282, `scripts/check-rls.ts`: `check:perms` now fails on the next table whose id sequence the person role can't use.
- #285, `src/app/dashboard/actions/collections.ts`: editing a collection runs as the person; choosing the receiving
  collection and deleting one find the collection as the person, with re-routing and artwork clean-up through
  `asSystem`. Creating one stays the app's own (it locks the desk row for the beta limit).
- `tests/person-notes-replies.test.ts`, `tests/person-collections.test.ts` (new); `SECURITY.md`, `docs/06-plan.md`,
  `docs/8. Project Implementation.md`, `docs/DATABASE.md` updated.
- No route changes. Nothing changes on screen.

## Checks
On `deb9fbb` locally after `npm ci`, e2e on ports 3390/3391.

| Check | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run lint` | passed (0 errors; 2 old warnings) |
| `npm test` | 385/386 on the first run (during a network outage on this Mac, `fetch failed` in the log); then 386/386 twice |
| `npm run check:perms` | passed |
| `npm audit --omit=dev` | passed (0 vulnerabilities) |
| `npm run e2e`, first run | stopped: this Mac lost internet, the test server could not fetch the Google fonts (`Module not found` for `next/font/google`) and every page timed out |
| `npm run e2e`, rerun | 55/56 in 6.4 min; `e2e/shortcuts.spec.ts:4` (Queue letter-key switch) failed once, then passed 3/3 with `--repeat-each 3` |
| Safety's own runs | `6daf1c0` (#282): typecheck, lint 0 errors, 382/382, check:perms, audit 0, e2e 56/56; `8d2942e` (#285): typecheck, lint 0 errors, 384/384, check:perms, audit 0, e2e 56/56 |

## Rollback
Last good deployment: `dpl_6Kk5t98JvVwvYj31BS51yPaTWWAh` (`67982df`, #277). An Instant Rollback is safe: the older code
works with the grant in place. The grant stays; removing it is never needed.
