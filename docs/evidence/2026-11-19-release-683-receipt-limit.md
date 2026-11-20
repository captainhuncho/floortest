# Release: #683, receipt limit (19 Nov 2026)

The public receipt check (`/api/pulse/receipt/[token]`) is capped per link, in memory, so one receipt link can't be
polled without limit. Server-only; nothing changes on screen. Added to `main`: 5 files, +95 −16
(`git diff e1b2a9f5 5a77bcfb`). Shipped on the owner's "ship it #683" in the Desk (lane:standard). No owner try needed:
server-only.

| Item | Value |
|---|---|
| PR | #683 |
| Head | `72bd100e` |
| Merge commit | `5a77bcfb` |
| Production deploy | 7913685691, success |
| Rollback target | deploy 7913186879 (`e1b2a9f5`, #669) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `72bd100e` | passed (6/6) |
| e2e: `receipt-proof.spec.ts`, `core-loop.spec.ts` (Backend) | `72bd100e` | 12 passed, 0 failed (40.8 s) |
| Merge with `main` | `e1b2a9f5` | GitHub CLEAN; merged without conflicts |
| Safety review | `72bd100e` | cleared |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None (the #669 report, #685, is open).

## After the merge
`main` merged into `mobile-next` as `713699a5`, no conflicts.

## Live versus unfinished
Live: Change cover (#669) and the receipt limit. On `mobile-next` for the owner's try, Safety cleared, e2e passed: tap
to play and Folder rename (#680), compact review card (#681, after its CI). Try-it candidates: volume reveal (#684),
Contacts (#679).
