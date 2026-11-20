# Release: #702, the phone app no longer opens the website checkout (20 Nov 2026)

App Review 3.1.1: in the app, plans may be bought only through the store, and that comes later. Inside the app (the
`FloorTestApp` user agent), the upgrade cards on Plans no longer link to checkout when billing is on. If the app opens
`/dashboard/checkout`, it is sent to Plans. The website is unchanged: Plans and checkout work as before in a browser.
No migrations and no new packages. Changed on `main`: 6 files, +30 −4 (`git diff 4bbbd602 c65b5ded`):
`src/app/dashboard/checkout/page.tsx`, `src/app/dashboard/plans/page.tsx`, `PlanCards.tsx`,
`e2e/app-no-checkout.spec.ts`, `docs/app-store-review.md` and `docs/product/receiver.md`. Shipped on the owner's
"ship it #702" typed in the Desk (lane:standard), after it was on `mobile-next` for the owner's try.

| Item | Value |
|---|---|
| PR | #702 |
| Head | `55887d8e` |
| Merge commit | `c65b5ded` |
| Production deploy | 7950842313, success |
| Rollback target | deploy 7950728531 (`4bbbd602`, #681) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `55887d8e` | passed |
| Typecheck, lint, unit (1097/0), check:perms, `audit:prod` (Build session) | `55887d8e` | all passed |
| e2e: `app-no-checkout.spec.ts` (the redirect) | before `main` went in | passed |
| e2e: full suite | | not run on this head; `main` going in changed only docs on this PR's side (Safety: its own lines md5-identical) |
| Safety review | `55887d8e` | cleared |
| On `mobile-next` for the owner's try | `88b5242c` | yes, before the ship; Safety verified that merge |
| Merge with `main` | `4bbbd602` | GitHub CLEAN; merged without conflicts |
| Health `/api/health`, `/`, `/login`, `/signup`, `/pricing` | production | 200, 200, 200, 200, 200 |

## Other releases since the last code report
- None. Reports #707 to #710, #712 and #713 are still open.

## After the merge
`main` merged into `mobile-next` as `00faefd9`, no conflicts.

## Live versus unfinished
Live: as in the #681 report, plus no website checkout inside the app. The App Store app changes only when the owner
submits a new build. Ready for the owner: the RevenueCat plugin (#706), desk folders admin-only writes (#695,
lane:owner, migration 0158, draft), reports #707 to #710, #712 and #713. Draft: the StoreKit test setup (#705).
Conflicting with `main`: review card option 1 (#691).
