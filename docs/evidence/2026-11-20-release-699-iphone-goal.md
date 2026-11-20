# Release: #699, the goal adds the iPhone app (20 Nov 2026)

`docs/goal.md` now has the iPhone app in scope: FloorTest's iPhone app passes App Review and is on the App Store,
built on the existing Capacitor wrapper (`mobile/`), with RevenueCat in-app purchase. Android stays out of scope
until the iPhone app is live. App Store Connect, RevenueCat and signing join the owner's list. Docs only. Added to
`main`: 1 file, +13 −4 (`git diff 239aecfd d67855ad`). The owner approved the goal with "goal ok" typed in BUILD, and
shipped it on "ship it #699" typed in the Desk (lane:auto).

| Item | Value |
|---|---|
| PR | #699 |
| Head | `82f8c8ba` |
| Merge commit | `d67855ad` |
| Production deploy | 7938051869, success |
| Rollback target | deploy 7937744132 (`239aecfd`, #698) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: Vercel, Vercel Preview Comments, dependency-review | `82f8c8ba` | passed (checks, Analyze and CodeQL don't run on a docs-only change) |
| Safety review | `82f8c8ba` | cleared; `docs/goal.md` only, no legal wording, the owner's own "goal ok" confirmed |
| Merge with `main` | `239aecfd` | GitHub CLEAN; merged without conflicts |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #697, report for #696: merge `0a3b26f7`, deploy 7937581544.
- #698, report for #684: merge `239aecfd`, deploy 7937744132.

## After the merge
`main` merged into `mobile-next` as `6ad19b0b`, no conflicts.

## Live versus unfinished
Live: as in the #684 report, plus this goal. Next for the iPhone app (BUILD, each a small PR): hide the web checkout
in the app, check the lock screen, safe areas; then RevenueCat purchase with Restore Purchases, push, and the listing
and privacy fixes. Packages the owner said yes to on 20 Nov (relayed to the Desk from BUILD and the hub), not yet added: `@capacitor/push-notifications` 8.1.3 and
`@revenuecat/purchases-capacitor` 14.1.2 (`mobile/` only). Parked: the desktop app plan (#700, draft). On `mobile-next`
for the owner's try: the clearer player buttons (#687), the compact review card (#681), review card option 1 (#691).
e2e in progress: Collections step 1 (#693).
