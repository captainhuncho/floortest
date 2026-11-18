# Release: #609, Settings on one page (option 47) (19 Nov 2026)

Settings on one page (option 47), replacing Account, with Sign out and Delete account as buttons at the bottom, each
opening its confirmation sheet. Added to `main`: 36 files, +1322 −89 (`git diff 7fdd33d5 90aa102a`). lane:owner. Shipped
on the owner's "ship it #609" typed in the Desk, after the owner tried it on `mobile-next`: "I tried the Settings bottom
buttons: worked" (typed in Safety, 18 Nov; same #609 code as the shipped head).

| Item | Value |
|---|---|
| PR | #609 |
| Head | `711d7782` |
| Merge commit | `90aa102a` |
| Production deploy | 7879430439, success |
| Rollback target | deploy 7872632067 (`7fdd33d5`, #640) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `711d7782` | passed (6/6) |
| Unit (1032/0), typecheck, lint, check:perms, `audit:prod` (Build) | `711d7782` | all passed |
| Full e2e | `711d7782` | 126 passed, 1 skipped, 0 failed (15.8 min; load 5.7 at start, 6.8 at end) |
| Merge with `main` | `63da81e8` | merged into the branch as `711d7782`, clean; Safety confirmed the PR's own lines unchanged from `a57f7a96` |
| Safety review | `a57f7a96`, then `711d7782` | cleared |
| On `mobile-next` for the owner's try | `a57f7a96` (`1e0c0cca`), then `711d7782` (`c4a6a7b8`) | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #640, report for #621: merge `7fdd33d5`, deploy 7872632067.

## Correction to the #621 report
The Safety review row should read `c0c35bec`, `fb713565`, then `49d70d5a`: Safety also cleared `fb713565`, the head the
earlier e2e ran on.

## After the merge
`main` merged into `mobile-next` as `7ed8ba5b`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621) and
Settings. Ready for the owner's word: Projects rights tick (#581, legal item 13 confirmed by the lawyer), the e2e test
fix (#635, after #642). Tried or on `mobile-next` for the owner's try, e2e passed: Review Queue keeps its place
(#601), the feedback card fix (#642). On `mobile-next`, e2e queued: the coming-soon page with day glass (#625), the
expanded player (#600). Waiting for the owner's try and e2e: the sign-in day glass (#641). Next build: wave detail
(build/wave-rms).
