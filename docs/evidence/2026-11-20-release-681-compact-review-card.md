# Release: #681, one compact review card (20 Nov 2026)

The review screen is one compact card: cover, title, artist, position and steps, one info line, one line of chips and
sender facts, and the note as a quote. Keep, Not for me and an icon-only More sit in one row at every size. Reply,
Download, Shortlist, Comment for the team and Delete move into More, and R still opens Reply. One folded Details holds
the file facts, the sender record, Review together, Move, Report and Delete. Download original is removed, because
More's Download is the same file. No migrations and no new packages. Who may review is unchanged. Changed on `main`:
11 files, +193 −195 (`git diff 738cb6a1 4bbbd602`), including `ReviewPanel.tsx`, `DecisionRail.tsx`,
`NowReviewing.tsx`, `MoreMenu.tsx`, `ReviewTogether.tsx`, `ClientBits.tsx`, the `queue-42` and `teams` specs,
`receiver.md` and `04-design.md`. The owner approved the drawing on 19 Nov ("good to go, build the compact review
card"). Shipped on the owner's "ship it #681" typed in the Desk (lane:standard), after it was on `mobile-next` for the
owner's try.

| Item | Value |
|---|---|
| PR | #681 |
| Head | `4dd66c97` |
| Merge commit | `4bbbd602` |
| Production deploy | 7950728531, success |
| Rollback target | deploy 7950316962 (`738cb6a1`, #711) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `4dd66c97` | passed (6/6) |
| Typecheck, lint, unit, check:perms, `audit:prod` (Build session) | `4dd66c97` | all passed |
| e2e: full suite | `4dd66c97` | 132 passed, 1 skipped, 0 failed. The skip is the deliberate one at `ops-overview.spec.ts:49` |
| Safety review | `4dd66c97` | cleared |
| On `mobile-next` for the owner's try | `ce41df40` | yes, before the ship |
| Merge with `main` | `738cb6a1` | GitHub CLEAN; merged without conflicts |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- None besides #711, which has its own report (#712, not merged yet). #707 to #710 are still open.

## After the merge
`main` merged into `mobile-next` as `2add2dbb`, no conflicts.

## Live versus unfinished
Live: as in the #711 report, plus the compact review card. Ready for the owner: hiding the web checkout in the phone app
(#702, on `mobile-next` for the owner's try), the RevenueCat plugin (#706), desk folders admin-only writes (#695,
lane:owner, migration 0158, draft), reports #707 to #710 and #712. Draft: the StoreKit test setup (#705). Review card
option 1 (#691) conflicts with `main` and was built on top of this card; it needs `main` merged in again.
