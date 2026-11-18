# Release: #661, track page: compact Details, Sender beside it, one "You kept" per keep (18 Nov 2026)

The track page shows Details as plain lines, the sender in their own card on the left, sender counts on the track card
only, and keeping an already-kept track no longer logs a second "You kept". Added to `main`: 7 files, +102 −62
(`git diff 7d23b6b2 bae2e0a8`). Shipped on the owner's "ship it #661" typed in the Desk (lane:standard), after the
owner tried it on `mobile-next`: "I tried the compact track page", then "Good, ready".

| Item | Value |
|---|---|
| PR | #661 |
| Head | `b5f610e2` |
| Merge commit | `bae2e0a8` |
| Production deploy | 7899228379, success |
| Rollback target | deploy 7896958221 (`7d23b6b2`, #660) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `b5f610e2` | passed (6/6) |
| Typecheck, lint (0 errors), unit, check:perms, `audit:prod` (Build) | `e242a0e9` | all passed |
| Full e2e | `e242a0e9` | 127 passed, 1 skipped, 1 failed (17.0 min; load 5.8 at start, 32.1 at end): `queue-42.spec.ts:91` still expected "Add a note" to open Details; the note now sits in the Sender card |
| e2e after the spec fix: `queue-42.spec.ts`, `batch.spec.ts`, `report-track.spec.ts` | `b5f610e2` | 6 passed, 0 failed (37 s). `b5f610e2` changes only `e2e/queue-42.spec.ts` from `e242a0e9` (one stale assertion removed, the focus check kept); the Desk and Safety accepted this as the e2e for this head |
| Merge with `main` | `7d23b6b2` | GitHub CLEAN. One shared file since the base `502ed90e`: `e2e/queue-42.spec.ts`, where `main` added a hydration wait on other lines (`53cb9234`); no shared app files |
| Safety review | `e242a0e9`, then `b5f610e2` | cleared |
| Owner decision (Safety P3) | | a repeat keep or "Not for me" by a different person updates who decided with no history line: the owner chose "Keep as built" |
| On `mobile-next` for the owner's try | `98757214` | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #660, report for #658: merge `7d23b6b2`, deploy 7896958221.

## After the merge
`main` merged into `mobile-next` as `bfe084fb`, no conflicts.

## Live versus unfinished
Live: Floor, Analytics, Prepare, the sign-in screens, Collections covers, Settings, the Projects rights change, the
wave detail, the delete-account steps, the expanded player, the email erase limits and the compact track page. On
`mobile-next` for the owner's try, e2e passed and Safety cleared: folder covers in the players (#663), Send music
option 58 A (#662). Ready for the owner's word, Safety cleared and CI green: the picomatch audit exception removal (#664). In tests: the full player's
volume reveal (`build/player-volume-reveal`).
