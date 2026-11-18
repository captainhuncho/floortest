# Release: #633, played-out permission check (18 Nov 2026)

Marking one track played out now follows the same permission rule as marking several: only the desk owner and A&R or
Admin on a desk with the Played out tool can do it. The Played out card is hidden from everyone else. Found by Safety in
code already live (not from an open PR), P2. 4 files, +99 −5. Shipped on the owner's "ship it #633" in the Desk
(lane:standard). As a security fix it did not need the owner's try on `mobile-next`.

| Item | Value |
|---|---|
| PR | #633 |
| Head | `ab42e47a` |
| Merge commit | `66cb5633` |
| Production deploy | 7870106108, success |
| Rollback target | deploy 7869167251 (`ea9d8860`, #631) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `ab42e47a` | passed |
| Unit, typecheck, lint, check:perms, `audit:prod` (Backend) | `7715cf86`, then `ab42e47a` | all exit 0; a new test runs the real action through real sessions and fails without the fix |
| e2e, targeted (Safety's list) | `ab42e47a` | 34 passed, 0 failed: teams, two-account-actions, receipt-proof, label-send, core-loop, batch, report-track, shortcuts, isolation, player-pair |
| Safety review | `7715cf86`, then `ab42e47a` | cleared; `ab42e47a` adds test assertions only |
| Health `/api/health`, `/` | production | 200, 200 |

## Other releases since the last code report
- #631, report for #624: merge `ea9d8860`, deploy 7869167251.

## After the merge
`main` merged into `mobile-next` as `a0331d7c`. One docs conflict in `docs/product/receiver.md`: kept `mobile-next`'s
"Review Queue, final layout" line and took #633's wording for the played-out rule on the next line.

## Live versus unfinished
Live: the played-out permission check. Ready for the owner's word: #632 (report for #627). Waiting for the owner's try:
#596 (Floor) and #621 (Collections covers). #609 (Settings) is lane:owner and needs the owner's yes in the Desk.
On hold: #600 (player does not match the drawing yet). e2e running or queued: #606, #599, #601, #617, and Build's
test-steadying PR.
