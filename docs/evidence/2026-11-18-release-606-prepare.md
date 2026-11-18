# Release: #606, Prepare as a folder page (18 Nov 2026)

Prepare, final (option 44): the crate as a folder page with one Download crate button. Added to `main`: 14 files, +600
−253 (`git diff 2c2f3fca bd719d31`). Shipped on the owner's "ship it #606" in the Desk (lane:standard), after the owner
tried it on `mobile-next` with Floor, Analytics and Collections covers: "They look good, close to the design."

| Item | Value |
|---|---|
| PR | #606 |
| Head | `f83cddf2` |
| Merge commit | `bd719d31` |
| Production deploy | 7871324578, success |
| Rollback target | deploy 7871177927 (`2c2f3fca`, #637) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `f83cddf2` | passed (6/6) |
| Full e2e | `bd2c2909` | 126 passed, 1 skipped, 0 failed, after the test fix `bd2c2909` (an earlier run failed `core-loop.spec.ts:73`, which counted radios across the whole page while the feedback ask was open) |
| Main merge | `f83cddf2` | `main` (#596) merged in by Build; one conflict in `docs/03-app-flow.md`, both sides kept; `src/` and `e2e/` byte-identical to `bd2c2909`, so the e2e and the owner's try carry over |
| Safety review | `bd2c2909`, then `f83cddf2` | cleared |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/` | production | 200, 200 |

## Other releases since the last code report
- #636, report for #596: merge `4657cebb`, deploy 7871135240.
- #637, report for #599: merge `2c2f3fca`, deploy 7871177927.

## After the merge
`main` merged into `mobile-next` as `cbb53639`, no conflicts. Before that, `mobile-next` had taken #625 (`7907704e`,
which contains #617 `3f7362dc`) as `54622f92` for the owner's try, from the sign-in session; Safety checked the merges.

## Live versus unfinished
Live: Floor (#596), Analytics (#599) and Prepare. Next: Collections covers (#621) needs a main merge and a fresh Safety
check now that Prepare is live. On the test link for the owner's try: sign-in screens (#617, full e2e running) and the
coming-soon page (#625). Settings (#609) is lane:owner and needs the owner's yes. Projects rights tick (#581) needs its
e2e and legal item 13. On hold: expanded player (#600).
