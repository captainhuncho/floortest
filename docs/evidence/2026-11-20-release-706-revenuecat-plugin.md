# Release: #706, the RevenueCat purchases plugin in the phone app (20 Nov 2026)

Prep for in-app purchase with Restore Purchases (App Review 3.1.1). Adds `@revenuecat/purchases-capacitor` 14.1.2,
pinned exactly, to `mobile/` only. Nothing calls it yet and no key is in the repo; configure, paywall, restore and the
server webhook come in later PRs. The owner said yes to the package in the Desk on 20 Nov (lane:owner). It is
RevenueCat's official Capacitor SDK (MIT), with one dependency, `@revenuecat/purchases-typescript-internal-esm` 20.10.0
(RevenueCat, MIT); neither has an install script. No web change and no migrations. Changed on `main`: 4 files, +27 −5
(`git diff c65b5ded 3d5ff51d`): `mobile/package.json`, `mobile/package-lock.json`, `CapApp-SPM/Package.swift` (written
by `cap sync ios`) and `docs/app-store-review.md` (row 3.1.1). Shipped on the owner's "ship it #706" typed in the Desk.

| Item | Value |
|---|---|
| PR | #706 |
| Head | `b624a6b6` |
| Merge commit | `3d5ff51d` |
| Production deploy | 7951069387, success |
| Rollback target | deploy 7950842313 (`c65b5ded`, #702) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `b624a6b6` | passed (6/6) |
| Typecheck, lint, unit, check:perms, `audit:prod` (Build session) | `059e9686` | all passed (the first unit run hit a Node V8 crash, not a test failure; the full rerun passed) |
| e2e | | not run: no web change |
| Safety review | `b624a6b6` | cleared |
| Merge with `main` | `c65b5ded` | GitHub CLEAN; merged without conflicts |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #702 (phone app no longer opens the website checkout): its report is on branch `desk/report-702`, PR not opened yet.
- Reports #707 to #710, #712 and #713 are still open.

## After the merge
`main` merged into `mobile-next` as `e1988ed3`, no conflicts; the test link points at that build.

## Live versus unfinished
Live: as in the #702 report. The plugin reaches the App Store app only when the owner submits a new build, and does
nothing until a later PR configures it. Owner's: the RevenueCat account and keys, and the Cookie and privacy policy
lines for RevenueCat (board #67). Ready for the owner: desk folders admin-only writes (#695, lane:owner, migration
0158, draft), reports #707 to #710, #712 and #713. Draft: the StoreKit test setup (#705). Conflicting with `main`:
review card option 1 (#691).
