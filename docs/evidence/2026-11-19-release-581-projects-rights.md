# Release: #581, Projects: no separate rights tick on own uploads (19 Nov 2026)

An owner adding their own audio to Projects no longer ticks a separate rights box per upload; the Terms line is the
confirmation. Added to `main`: 5 files, +48 −7 (`git diff 90aa102a 5bb67d8f`). Shipped on the owner's "ship it #581" in the
Desk (lane:standard), after the owner's "try it #581" on `mobile-next` and legal item 13 closed by the owner in the Desk:
"The lawyer confirmed legal item 13 for Projects uploads."

| Item | Value |
|---|---|
| PR | #581 |
| Head | `de1e1ce1` |
| Merge commit | `5bb67d8f` |
| Production deploy | 7879831378, success |
| Rollback target | deploy 7879430439 (`90aa102a`, #609) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `de1e1ce1` | passed (6/6) |
| e2e: `batch.spec.ts`, `folders.spec.ts` (the Projects upload paths, including strangers and other collections refused) | `de1e1ce1` | 5 passed, 0 failed (26.7 s; load 16.2 at start, 17.1 at end) |
| Merge with `main` | `90aa102a` | GitHub CLEAN; merged without conflicts |
| Safety review | `de1e1ce1` | cleared |
| Legal item 13 | | closed by the owner in the Desk, 19 Nov |
| On `mobile-next` for the owner's try | `2882d539` | yes, before the ship |
| Health `/api/health`, `/`, `/login` | production | 200, 200, 200 |

## Other releases since the last code report
None merged yet. The report for #609 (#643) is open.

## After the merge
`main` merged into `mobile-next` as `66977d0a`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609) and the Projects rights change. Ready for the owner's word: the #609 report (#643), the e2e test fix (#635, after
#642). On `mobile-next` for the owner's try, e2e passed: Review Queue keeps its place (#601), the feedback card fix
(#642). On `mobile-next`, e2e queued: the coming-soon page with day glass (#625), the expanded player (#600). Waiting
for the owner's try and e2e: the sign-in day glass (#641). Next build: wave detail (build/wave-rms).
