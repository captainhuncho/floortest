# Release: #696, the App Store review list re-checked against Apple's live guidelines (20 Nov 2026)

`docs/app-store-review.md` re-checked against Apple's App Review Guidelines ("Last Updated: October 16, 2026"), with
status and evidence from the code at `907ae88e`. Docs only: no code, no App Store Connect actions, no legal wording.
Added to `main`: 1 file, +69 −33 (`git diff 907ae88e ab4c7200`). Shipped on the owner's "ship it #696" typed in the
Desk (lane:auto).

Gaps it records: no StoreKit in-app purchase (2.1(b), 3.1.1); Restore Purchases is a toast only; no subscriptions or
paywall (3.1.2); the plans link to the web checkout inside the app (3.1.3(b), `PlanCards.tsx:181`); no push (4.2); the
store listing promises Sign in with Apple (2.3); the listing's privacy table does not match `PrivacyInfo.xcprivacy`
(5.1.1, 5.1.2). Meets: 4.8 sign-in, 5.1.1(v) account deletion, 1.2 report and block, privacy manifest present. Paddle
is not wired: the checkout is a card form that says payments are not connected.

| Item | Value |
|---|---|
| PR | #696 |
| Head | `86baab81` |
| Merge commit | `ab4c7200` |
| Production deploy | 7937101766, success |
| Rollback target | deploy 7936431035 (`907ae88e`, #694) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: Vercel, Vercel Preview Comments, dependency-review | `86baab81` | passed (checks, Analyze and CodeQL don't run on a docs-only change) |
| Safety review | `86baab81` | cleared; citations match `907ae88e`; one file, docs only |
| Merge with `main` | `907ae88e` | GitHub CLEAN; merged without conflicts |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

Known nit, left so the cleared head stayed as is: `store-listing.md` says "12+ / Teen (confirm)" while the age rating
row says the draft "suggests 12+ or 18+". The age rating is the owner's call.

## Other releases since the last code report
- #694, report for #686: merge `907ae88e`, deploy 7936431035.

## After the merge
`main` merged into `mobile-next` as `61e6dcd2`, no conflicts.

## Live versus unfinished
Live: as in the #686 report, plus this list. On `mobile-next` for the owner's try: the compact review card (#681), the
volume reveal (#684), the clearer player buttons (#687), review card option 1 (#691). Waiting for e2e: the volume reveal
(#684, running), Collections step 1 (#693), desk folders admin-only writes (#695, migration 0158 on the preview DB).
Waiting for the owner: the iPhone app goal and its in-app purchase decisions.
