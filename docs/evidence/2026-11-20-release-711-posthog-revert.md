# Release: #711, PostHog removed again (20 Nov 2026)

Undoes #704, PostHog product analytics. The owner typed "roll back posthog" in the Desk and chose to undo it in code
through a revert PR, not an instant Vercel rollback. PostHog was never live in use: there was no key in production or
preview. The revert is `git revert -m 1 60f60d54`, a single commit on `60f60d54`. Changed on `main`: 19 files, +7 −1275
(`git diff 60f60d54 738cb6a1`). `main` after the merge is byte-identical to `38e7c1e9` (#703), so nothing else
changes. Removed: `posthog-js` from `package.json` and the lockfile, `src/lib/posthog-client.ts`,
`src/lib/product-analytics.ts`, `ProductAnalytics.tsx`, `https://eu.i.posthog.com` from the CSP and its test, the e2e
spec and fixtures, the unit tests, `docs/posthog.md`, and the `.env.example`, services and `SECURITY.md` lines. No
migrations. Shipped on the owner's "ship it #711" typed in the Desk (lane:standard).

| Item | Value |
|---|---|
| PR | #711 |
| Head | `9eb8eb51` |
| Merge commit | `738cb6a1` |
| Production deploy | 7950316962, success |
| Rollback target | deploy 7946904992 (`60f60d54`, #704) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `9eb8eb51` | passed |
| Typecheck, lint, unit, check:perms, `audit:prod` (Build session) | `9eb8eb51` | all passed |
| e2e: full suite | `9eb8eb51` | 132 passed, 1 skipped, 0 failed (18.1 min; load 12.7 at start, 23.9 at end). The skip is the deliberate one at `ops-overview.spec.ts:49` |
| Exact inverse of #704 (Safety) | `9eb8eb51` | tree byte-identical to `38e7c1e9`; no AI signature |
| Safety review | `9eb8eb51` | cleared |
| Merge with `main` | `60f60d54` | GitHub CLEAN; merged without conflicts |
| Live CSP | production | no `posthog` host |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

The CodeQL alert from #704 (`e2e/product-analytics-consent.spec.ts:75`) goes away with the spec.

## Other releases since the last code report
- #704, PostHog, merged by the owner on GitHub: merge `60f60d54`, deploy 7946904992 (report #710, not merged yet).
- #707, #708 and #709 (reports for #693, #687 and #703): not merged yet.

## After the merge
`main` merged into `mobile-next` as `fb871a88`, no conflicts.

## Live versus unfinished
Live: as in the #703 report; PostHog is gone. Ready for the owner: the compact review card (#681), hiding the web
checkout in the phone app (#702, on `mobile-next` for the owner's try), the RevenueCat plugin (#706), desk folders
admin-only writes (#695, lane:owner, migration 0158, draft), reports #707 to #710. Draft: the StoreKit test setup
(#705). Conflicting with `main`: review card option 1 (#691). Open with the owner: Cookie Policy and privacy policy lines
for RevenueCat (board #67); the PostHog lines are no longer needed while PostHog is out.
