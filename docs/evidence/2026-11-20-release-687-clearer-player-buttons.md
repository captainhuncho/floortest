# Release: #687, six clearer player buttons (20 Nov 2026)

Six small look-only fixes so the player's picture-only buttons read better ("The six small ones"). The bar's open
button is an expand mark, not an up arrow. On laptops the full player's Close is a cross; phones keep the down arrow.
The "15" on Back 15 and Forward 15 is larger. The cover play mark is larger with a thin light edge, so it reads on dark
and light covers. Previous, Next, Back 15 and Forward 15 use the main text colour while they work; only a switched-off
one is faint. The bar's track title underlines on hover and keyboard focus. No control is under 44px and nothing
depends on hover. Added to `main`: 4 files, +27 −18 (`git diff 5abfab95 e3ba803a`): `PlayerBars.tsx`,
`PlayerExpanded.tsx` and two docs. Shipped on the owner's "ship it #687" typed in the Desk (lane:standard), after it was
on `mobile-next` for the owner's try and after the owner's before/after page.

| Item | Value |
|---|---|
| PR | #687 |
| Head | `54305c60` |
| Merge commit | `e3ba803a` |
| Production deploy | 7942542216, success |
| Rollback target | deploy 7941194137 (`5abfab95`, #693) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `54305c60` | passed (6/6) |
| Typecheck, lint (0 errors), unit (1081/1081), check:perms, `audit:prod` (player session) | `54305c60` | all passed |
| e2e: `player-expanded.spec.ts`, `player-pair.spec.ts` | `54305c60` | 6 passed, 0 failed |
| e2e: full suite | `54305c60` | 132 passed, 1 skipped, 0 failed (16.3 min; load 8.0 at start, 13.8 at end). The skip is the deliberate one at `ops-overview.spec.ts:49` |
| Before/after renders (phone 390, laptop 1440, night and day, dark and light cover) | before `910f497a`, after `54305c60` | 20 shots each, shown to the owner |
| Safety review | `54305c60` | cleared |
| Merge with `main` | `5abfab95` | GitHub CLEAN; merged without conflicts |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

The e2e server logged "uncaughtException: Error: aborted" 14 times with no test failing; tracked on board #65.

## Other releases since the last code report
- #707, report for #693: not merged yet.

## After the merge
`main` merged into `mobile-next` as `789620ac`, no conflicts.

## Live versus unfinished
Live: as in the #693 report, plus the clearer player buttons. Ready for the owner: the compact review card (#681; it and
#687 both edit `docs/04-design.md`, so it needs `main` merged in again), desk folders admin-only writes (#695,
lane:owner, migration 0158, draft), the RevenueCat plugin (#706) and the push notifications plugin (#703), which touch
the same `mobile/` files; the StoreKit test setup (#705, draft). Waiting for the owner's try: hiding the web checkout in
the phone app (#702). Being fixed: PostHog analytics (#704, one more round, then Safety). Conflicting with `main`:
review card option 1 (#691).
