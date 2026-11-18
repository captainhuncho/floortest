# Release: #650, the wave keeps its shape (18 Nov 2026)

A track's wave now shows each slice's average level (RMS) instead of its loudest sample, so loud sections keep their
shape (kicks, build-ups, breakdowns) instead of one flat block. Applies to tracks sent after this release; tracks already
sent keep their wave, nothing is re-measured. Added to `main`: 3 files, +66 −10 (`git diff 1ad730ce 9bd315f8`). Shipped
on the owner's "ship it #650" typed in the Desk (lane:standard), after the owner tried it on `mobile-next` ("worked",
relayed by Safety).

| Item | Value |
|---|---|
| PR | #650 |
| Head | `529d066b` |
| Merge commit | `9bd315f8` |
| Production deploy | 7888256483, success |
| Rollback target | deploy 7884923595 (`1ad730ce`, #646) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `529d066b` | passed (6/6) |
| Typecheck, lint (0 errors), unit (1041 passed, incl. new `tests/wave-peaks.test.ts`), check:perms, `audit:prod` (Build) | `529d066b` | all passed |
| Full e2e | `529d066b` (`main` `678508df` merged in) | 126 passed, 1 skipped, 0 failed (16.5 min) |
| Merge with `main` | `1ad730ce` | GitHub CLEAN; `main` had only report PRs since `678508df` |
| Safety review | `529d066b` | cleared |
| On `mobile-next` for the owner's try | `529d066b` | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #646, report for #625: merge `1ad730ce`, deploy 7884923595.

## After the merge
`main` merged into `mobile-next` as `052e81fa`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581), the feedback card fix (#642), the coming-soon day glass (#625), the e2e
test fix (#635), Review Queue final (#601), the sign-in day glass (#641) and the wave detail. Ready for the owner's
word: the queue test wait fix (#651), the cover access test (#653), and reports #647, #648, #649; #645 waits for its
wording fix. On `mobile-next` for the owner's try: the expanded player (#600, `3642f514`; full e2e owed, phone layout
change pending) and Delete account with DELETE FLOORTEST and no password (#652, lane:owner). Seeded demo tracks keep
the old wave (`scripts/seed.ts` has its own copy of the old measure).
