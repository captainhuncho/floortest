# Release: #664, picomatch audit exception removed (18 Nov 2026)

The time-boxed picomatch exception (GHSA-fc5q-39xc-vjpf, owner's yes 17 Nov) is gone: the advisory was withdrawn and
`npm audit --omit=dev` lists nothing on `main`, so the allow-list entry in `scripts/audit-check.ts` is removed and the
`SECURITY.md` bullet marked closed. `npm run audit:prod` again allows no exception. Added to `main`: 2 files, +2 −9
(`git diff bae2e0a8 3e757804`). Shipped on the owner's "ship it #664" typed in the Desk (lane:standard). No visible
change, so no try on `mobile-next` was needed.

| Item | Value |
|---|---|
| PR | #664 |
| Head | `de043772` |
| Merge commit | `3e757804` |
| Production deploy | 7899343823, success |
| Rollback target | deploy 7899228379 (`bae2e0a8`, #661) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `de043772` | passed (6/6) |
| Local checks (Backend) | `de043772` | passed |
| e2e | | not needed: no app code, no sending, review, download, receipt or auth path touched |
| Merge with `main` | `bae2e0a8` | GitHub CLEAN; no files shared with `main` since the base `7d23b6b2` |
| Safety review | `de043772` | cleared |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None (the #661 report is in the same PR).

## After the merge
`main` merged into `mobile-next` as `9d1db52b`, no conflicts.
