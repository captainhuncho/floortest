# Release: #601, Review Queue final (option 42): Now reviewing card and Up next playlist (18 Nov 2026)

The Review Queue as a Now reviewing card above an Up next playlist, with a More menu, and the queue keeps its place when a
track is tapped. Added to `main`: 18 files, +890 −171 (`git diff ad759d19 ed9f5461`). Shipped on the owner's
"ship it #601" typed on its own in the Desk (lane:standard), after the change was on `mobile-next` for the owner's try.

| Item | Value |
|---|---|
| PR | #601 |
| Head | `3a5e9028` |
| Merge commit | `ed9f5461` |
| Production deploy | 7883636542, success |
| Rollback target | deploy 7883450643 (`ad759d19`, #635) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `3a5e9028` | passed (6/6) |
| Full e2e | `8f0a06ce` | 128 passed, 1 skipped, 0 failed, 0 flaky (15.9 min; load 12.7 at start, 6.3 at end) |
| Merge with `main` `7fdd33d5` | `3a5e9028` | merged into the branch, normal push; typecheck, lint, check:perms passed; `core-loop.spec.ts` 3 passed (22.3 s, load 6.7) |
| Merge with `main` | `ad759d19` | `git merge-tree` clean; only `docs/product/receiver.md` touched by both, so the e2e carries over |
| Safety review | `8f0a06ce`, then `3a5e9028` | cleared |
| On `mobile-next` for the owner's try | `3a5e9028` | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup`, `/dashboard/review` | production | 200, 200, 200, 200, 200 |

## Other releases since the last code report
None merged. The reports for #642 (#645), #625 (#646) and #635 (#647) are open.

## After the merge
`main` merged into `mobile-next` as `ce7672d6`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581), the feedback ask fix (#642), the coming-soon day glass (#625), the steadier
e2e runs (#635) and the Review Queue. On `mobile-next` for the owner's try, e2e passed: the sign-in day glass (#641).
Being fixed after a failed e2e: the expanded player (#600; the Undo message is hidden behind the full player on
`mobile-next`). Next build: wave detail (build/wave-rms).
