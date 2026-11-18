# Release: #641, sign-in screens with the day glass card (18 Nov 2026)

In day mode the sign-in screens (welcome story, end card, log in, sign up) put a glass card behind the content over the
photo, the same logic as the coming-soon page (#625). Night mode is unchanged. Added to `main`: 2 files, +70 −4
(`git diff ed9f5461 bd56a823`). Shipped on the owner's "ship it #641" typed on its own in the Desk (lane:standard),
after the owner tried it on `mobile-next`: "I tried the daytime sign-in screens: worked" (typed in the Desk).

| Item | Value |
|---|---|
| PR | #641 |
| Head | `0af462d4` |
| Merge commit | `bd56a823` |
| Production deploy | 7883914180, success |
| Rollback target | deploy 7883636542 (`ed9f5461`, #601) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `0af462d4` | passed (6/6) |
| Typecheck, lint (0 errors), unit (1021), check:perms, `audit:prod` (option 54 session) | `0af462d4` | all passed |
| Full e2e | `0af462d4` | 126 passed, 1 skipped, 0 failed (17.3 min; load 12.3 at start, 69.5 at end) |
| Merge with `main` | `ed9f5461` | GitHub CLEAN; `git merge-tree` clean; only `docs/product/receiver.md` touched by both, so the e2e carries over |
| Safety review | `0af462d4` | cleared |
| On `mobile-next` for the owner's try | `0af462d4` (`098b5836`) | yes, tried by the owner before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None merged. The reports for #642 (#645), #625 (#646), #635 (#647) and #601 (#648) are open.

## After the merge
`main` merged into `mobile-next` as `779a9c65`; no file changes, since `mobile-next` already had #641.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617) with the day glass, Collections covers
(#621), Settings (#609), the Projects rights change (#581), the feedback ask fix (#642), the coming-soon day glass
(#625), the steadier e2e runs (#635) and the Review Queue (#601). Being fixed after a failed e2e: the expanded player
(#600). e2e running: wave detail (build/wave-rms).
