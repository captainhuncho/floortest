# Release: #703, the iPhone app gets the push notifications plugin, install only (20 Nov 2026)

Adds `@capacitor/push-notifications` 8.1.3, pinned exactly, to `mobile/` only: Ionic's official Capacitor push plugin
(ionic-team/capacitor-plugins, MIT), no runtime dependencies, no install script. Nothing calls it yet; later PRs add the
`aps-environment` entitlement, the permission ask and the server sender. The website is unchanged, and the App Store app
changes only when the owner submits a new build. Added to `main`: 4 files, +14 −1 (`git diff e3ba803a 38e7c1e9`):
`mobile/package.json`, `mobile/package-lock.json`, `CapApp-SPM/Package.swift` and row 4.2 of `docs/app-store-review.md`.
The owner said yes to the package in the Desk on 20 Nov; shipped on the owner's "ship it #703" typed in the Desk
(lane:standard).

| Item | Value |
|---|---|
| PR | #703 |
| Head | `f7efaf47` |
| Merge commit | `38e7c1e9` |
| Production deploy | 7946802366, success |
| Rollback target | deploy 7942542216 (`e3ba803a`, #687) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `f7efaf47` | passed (6/6) |
| Typecheck, lint, unit, check:perms, `audit:prod` (Build session) | `f7efaf47` | all passed |
| e2e | | not run: no web change |
| Package check (Safety) | | exists on npm, real repo, exact pin, resolved from registry.npmjs.org, no install script |
| Safety review | `f7efaf47` | cleared |
| iOS build in Xcode or the simulator | | not run: the simulator waited on machine load. The `Package.swift` change is what `cap sync ios` writes |
| Merge with `main` | `e3ba803a` | GitHub CLEAN; merged without conflicts |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #708, report for #687: not merged yet. #707, report for #693: not merged yet.

## After the merge
`main` merged into `mobile-next` as `649b24eb`, no conflicts.

## Live versus unfinished
Live: as in the #687 report, plus the push plugin (not yet used). Ready for the owner: the compact review card (#681, on
`mobile-next`), desk folders admin-only writes (#695, lane:owner, migration 0158, draft), the RevenueCat plugin (#706;
it edits the same `mobile/` files, so `main` goes into it and its checks run again first), the StoreKit test setup
(#705, draft). Waiting for the owner's try: hiding the web checkout in the phone app (#702; needs `main` merged in first). Being fixed: PostHog
analytics (#704, last round; parked if Safety fails it). Open with the owner: Cookie Policy and privacy policy lines for
PostHog and RevenueCat (board #67). Conflicting with `main`: review card option 1 (#691) and hiding the web checkout in the phone app (#702,
`docs/app-store-review.md`, since this release).
