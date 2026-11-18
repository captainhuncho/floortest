# Release: #622, narrow audit exception for GHSA-fc5q-39xc-vjpf (17 Nov 2026)

A picomatch ReDoS advisory (GHSA-fc5q-39xc-vjpf, updated 15:56 UTC, no patched release) made `npm audit --omit=dev`
fail on every branch through `@sentry/nextjs` → `@rollup/plugin-commonjs` → picomatch 4.0.7, a build-time path. The
owner chose a narrow, time-boxed exception ("Picomatch option 1, go", typed in the Desk). `npm run audit:prod`
(`scripts/audit-check.ts`) now replaces the raw audit in CI and in the push checks: it fails on any high or critical
finding unless every advisory in its chain is on the allow-list, which holds this one ID until 2026-12-17. The entry
is in `SECURITY.md` under accepted risks. 8 files, +207 −8. lane:urgent. Shipped on the owner's "ship it #622".

| Item | Value |
|---|---|
| PR | #622 |
| Head | `a9d6d83c` |
| Merge commit | `c65a51e8` |
| Production deploy | 7863292915, success |
| Rollback target | deploy 7862602037 (`01c20feb`, #623); or revert the PR |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `a9d6d83c` | passed |
| Unit, typecheck, lint, check:perms, `audit:prod` (Backend) | `4d94a930`, then `a9d6d83c` | passed; `audit:prod` allows exactly the 5 GHSA-fc5q-39xc-vjpf entries |
| Safety review | `25f11da2` not cleared (fails open when the registry is unreachable); `a76cbf92` not cleared (`{}` passed); `4d94a930` cleared; `a9d6d83c` cleared | the final check rejects error JSON, `{}`, a 404 shape, a report without metadata and non-number totals, exits 1 offline, and cross-checks the listed findings against npm's totals |
| e2e | | not needed: nothing in the change runs in the app |
| Health `/api/health` | production | 200, database ok |

## After the merge
`main` merged into `mobile-next` as `d6cd941b`, no conflicts. The owner's global rule for "before every push" now
names `npm run audit:prod` for FloorTest (owner's yes, 17 Nov). There is no automated local audit; CI is the gate.

## Live versus unfinished
Live: the audit check with the one dated exception. Waiting: a daily check for a patched picomatch, and removing the
entry when one ships or on 17 Dec. Next, with main merged in: #609, #610, #611, #624 (crons every 15 minutes), the
live-update fix, and #600.
