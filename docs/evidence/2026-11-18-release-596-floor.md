# Release: #596, Floor laid out as drawn in option 41 (18 Nov 2026)

The Floor, final (option 41): a greeting, the link row, two crates, the weekend question and Your week. 15 files,
+566 −451. Shipped on the owner's "ship it #596" in the Desk (lane:standard), after the owner tried it on `mobile-next`
together with Analytics (#599), Prepare (#606) and Collections covers (#621): "They look good, close to the design."
The owner asked for one improvement round after all redesigned pages are done, not page by page.

| Item | Value |
|---|---|
| PR | #596 |
| Head | `78b146d6` |
| Merge commit | `2396ef37` |
| Production deploy | 7870823611, success |
| Rollback target | deploy 7870338774 (`8d97b905`, #634) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `78b146d6` | passed (6/6) |
| Full e2e | `78b146d6` | 125 passed, 1 skipped, 1 failed (16.5 min): `batch.spec.ts:74`, adding a WAV on Projects, which #596 does not touch |
| e2e gate, `batch.spec.ts` repeated 3 times | `78b146d6` | `:74` and `:53` passed 3/3; `:4` failed on repeats 2 and 3 only because it deletes its own seeded track in a shared database, and passed on fresh databases. Test fix in #635 |
| Earlier full e2e (before the last changes) | `51211def` | 118 passed, 1 skipped, 0 failed (16.3 min) |
| Merge with `main` | `66cb5633` | Build test-merged the head with `git merge-tree`: clean, so the head and its e2e stay valid |
| Safety review | `78b146d6` | cleared; Safety accepted the e2e gate above |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/` | production | 200, 200 |

## Other releases since the last code report
- #632, report for #627: merge `62c2638d`, deploy 7870294623.
- #634, report for #633: merge `8d97b905`, deploy 7870338774.

## After the merge
`main` merged into `mobile-next` as `919b1e69`, no conflicts.

## Live versus unfinished
Live: the Floor redesign. Tried by the owner and ready for the owner's word: Analytics (#599, full e2e on `badcf64b`
126 passed, 0 failed, 1 skipped). Prepare (#606): tried by the owner; needs a main merge (docs conflict) before the
owner's word. Waiting: Collections covers (#621, ships after Prepare and needs a fresh Safety check then). Settings (#609)
is lane:owner and needs the owner's yes in the Desk. e2e queue next: sign-in screens (#617), the e2e test fix (#635),
Review Queue (#601), coming-soon page (#625). On hold: expanded player (#600).
