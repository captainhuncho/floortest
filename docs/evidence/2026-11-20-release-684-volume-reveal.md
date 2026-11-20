# Release: #684, the full player's volume slides out from the speaker (20 Nov 2026)

In the full player from 1024px, only the speaker shows at first. Pointing at it, or reaching it with the keyboard,
slides out the volume slider and its level in %, which fold away again after. It is the same rule as the floating
bar. Screens with no hover always show the slider, and Reduce Motion shows it without the slide. Added to `main`:
4 files, +27 −12 (`git diff ab4c7200 1498c5da`): `PlayerExpanded.tsx`, `e2e/player-expanded.spec.ts` and two docs.
Shipped on the owner's "ship it #684" typed in the Desk (lane:standard), after it was on `mobile-next` for the owner's
try. The owner chose to ship the player changes in order: this one first, then the clearer player buttons (#687).

| Item | Value |
|---|---|
| PR | #684 |
| Head | `910f497a` |
| Merge commit | `1498c5da` |
| Production deploy | 7937430866, success |
| Rollback target | deploy 7937101766 (`ab4c7200`, #696) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `910f497a` | passed (6/6) |
| e2e: `player-expanded.spec.ts`, `player-pair.spec.ts` | before the latest merge with `main` | 6 passed, 0 failed |
| e2e: full suite | `910f497a` | 128 passed, 1 failed, 1 skipped, 1 not run (131 tests, 19.7 min; load 18.0 at start, 54.1 at end) |
| Cause of the failure | | `isolation.spec.ts:18` threw `read ECONNRESET` on `GET /api/tracks/5/audio` before any assertion ran; the server logged aborted streams through the run. `isolation.spec.ts:61` did not run because the file is serial. The skip is the deliberate one at `ops-overview.spec.ts:49` |
| e2e: `isolation.spec.ts` alone | `910f497a` | 2 passed, 0 failed (20.8 s; load 16.2 at start), no aborted lines in the server log |
| Merge with `main` | `ab4c7200` | GitHub CLEAN; merged without conflicts |
| Safety review | `910f497a` | cleared; agreed the two runs together are green, since #684 touches no auth, API or audio route |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

The aborted-stream noise in the e2e server log is tracked separately (board #65).

## Other releases since the last code report
- #694, report for #686: merge `907ae88e`, deploy 7936431035.
- #696, the App Store review list (docs): merge `ab4c7200`, deploy 7937101766.
- #697, report for #696: merge `0a3b26f7`, deploy 7937581544.

## After the merge
`main` merged into `mobile-next` as `b440a5ea`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581), change cover (#669), the receipt limit (#683), the code email (#688), tap to
play with pause (#680), the Projects page (#675), folder drag and drop (#686) and the volume reveal. On `mobile-next`
for the owner's try: the clearer player buttons (#687, next: merge `main` in, rerun its checks, Safety), the compact
review card (#681), review card option 1 (#691). e2e running: Collections step 1 (#693). Waiting for e2e: desk folders
admin-only writes (#695, migration 0158 on the preview DB). Waiting for the owner: the iPhone app goal, and plans and
prices for in-app purchase.
