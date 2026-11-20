# Release: #717, site lock waits for a waking database (20 Nov 2026)

The site lock read its setting with a short timeout. When the production database was waking from idle, that read
timed out (76 "site_lock read timed out" log lines in the 24 hours before) and visitors could be locked out or let in
by the fallback instead of the real setting. The fix gives the read time for a waking database before falling back.
Changed: `src/lib/site-gate.ts` and `tests/site-lock.test.ts`, +28 −4. No migrations. Shipped on the owner's
"ship it #717" typed in the Desk (lane:owner).

| Item | Value |
|---|---|
| PR | #717 |
| Head | `a2349ad7` |
| Merge commit | `30c207e8` |
| Production deploy | `dpl_5Jpy1wbyzZE5YvYgNxi5eFyS5oQk`, success |
| Rollback target | deploy 7954639695 (`11e07af6`, #716) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, dependency-review, Vercel | `a2349ad7` | passed |
| CI: CodeQL results check | `a2349ad7` | still queued at merge; its Analyze run had passed |
| Unit (Backend session) | `a2349ad7` | 1089 of 1089 passed |
| e2e: full suite | `a2349ad7` | 133 passed, 1 skipped (the deliberate one) |
| Safety review | `a2349ad7` | cleared |
| Merge with `main` | `11e07af6` | GitHub MERGEABLE; merged without conflicts |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |
| Site lock state | production | home shows "Coming soon" and the waitlist, as set |
| "site_lock" log lines | new deploy, first 15 min | none |

## Other releases since the last code report
- #716 (docs only): merge `11e07af6`, deploy 7954639695.

## After the merge
`main` merged into `mobile-next` as `3d514efc`, no conflicts; the test link points at it.

## Live versus unfinished
Live: as in the #711 report, plus the site-lock fix. Waiting: the StoreKit test setup (#705, draft). Conflicting with
`main`: #691 and #674. Next build work after the owner's pages: Floor copy (board #72) and Queue direction D (board #73).
