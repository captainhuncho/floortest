# Release: #704, PostHog product analytics code, merged by the owner on GitHub (20 Nov 2026)

PostHog product analytics, meant to load only after Accept on the cookie banner, with EU hosting and masked session
replay. The owner merged the PR himself on GitHub at 16:28:43Z, outside the Desk; he confirmed it in the hub ("Yes,
keep it"). There was no "ship it #704" in the Desk, and Safety had not cleared it: the round-5 blind review was still
open at the merge, and both reviewers then failed it. The code is live but inert. Production has no
`NEXT_PUBLIC_POSTHOG_KEY`, so the loader never runs. PostHog is parked (owner's option 1: one last round, parked if it
fails). Added to `main`: 19 files, +1275 −7 (`git diff 38e7c1e9 60f60d54`), including `posthog-js` 1.453.0 (owner yes in
the Desk, 20 Nov), `src/lib/posthog-client.ts`, `src/lib/product-analytics.ts`, `ProductAnalytics.tsx`, the CSP and
`docs/posthog.md`.

| Item | Value |
|---|---|
| PR | #704 |
| Head | `8921f234` |
| Merge commit | `60f60d54`, by the owner on GitHub |
| Production deploy | 7946904992, success |
| Rollback target | deploy 7946802366 (`38e7c1e9`, #703) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, dependency-review, Vercel, Vercel Preview Comments | `8921f234` | passed |
| CI: CodeQL | `8921f234` | failed: 1 new alert (CodeQL high), js/incomplete-url-substring-sanitization in the e2e test `e2e/product-analytics-consent.spec.ts:75` (route filter `hostname.endsWith("posthog.com")`); test-only, no runtime risk; fixed in the follow-up |
| Typecheck, lint, unit (1092/0), check:perms, audit (Build session) | `8921f234` | all passed |
| e2e: `product-analytics-consent.spec.ts` | `8921f234` | 13 passed, twice; the second run started at load 20.0, just over the gate |
| e2e: full suite | | not run |
| Safety review | `8921f234` | NOT CLEARED. Round 5: both blind reviewers failed it |
| Live, from outside (Safety) | production | no PostHog key in production env (names read only); the live chunk guards the loader on the key; 0 PostHog requests and 0 `ph_` storage before a choice and after Reject; `window.posthog` undefined. CSP `connect-src` now allows `https://eu.i.posthog.com`, which sends nothing by itself |
| Security headers | production | XFO DENY, `frame-ancestors 'none'`, HSTS, no X-Powered-By |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Open findings (Safety, round 5)
1. Withdrawal does not always reach other tabs: `withdraw()` returns before the broadcast when the tab never had PostHog
   live (`posthog-client.ts:210-211`). A tab that accepted keeps running and can resend.
2. Retries (`retriableRequest`, the flush queue) skip `before_send` and the opt-out check, so a failed event can be resent
   in a tab that has not heard about a withdrawal.
3. Smaller: `withdraw()` has no try/finally; `dropPendingFrames` reads storage outside its try.
4. Docs: `docs/13`, the processor table in `docs/05`, the env list in `docs/02` and `SECURITY.md` sections 3 and 4 do not
   name PostHog yet.

## Rule until fixed
No PostHog key in production or preview until Safety clears a fix of the findings above and the owner's Cookie Policy,
privacy policy and banner wording is done (board #35, #67). The key and that wording are the owner's.

## Owner's decision after the merge
On 20 Nov the owner typed "roll back posthog" in the Desk and chose option 1: undo PostHog in the code through a revert
PR (Safety, the owner's try, then "ship it"), not an instant Vercel rollback. Production stays on deploy 7946904992
until that PR ships; the code stays inert because there is no key.

## Other releases since the last code report
- #707, #708 and #709 (reports for #693, #687 and #703): not merged yet.

## Live versus unfinished
Live: as in the #703 report, plus the PostHog code, inert. Ready for the owner: the compact review card (#681), desk
folders admin-only writes (#695), the RevenueCat plugin (#706, `main` going in first), the StoreKit test setup (#705,
draft), reports #707, #708 and #709. Needs `main` merged in: hiding the web checkout in the phone app (#702) and review
card option 1 (#691). Parked: PostHog analytics, until a fix is cleared.
