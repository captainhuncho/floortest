# Release: #642, the feedback ask waits for the next page (18 Nov 2026)

After a person's 5th Keep / Not for me, the one-time feedback ask used to appear at the top of the page they were on and
push Keep / Not for me about 300 px down under the finger (desktop CLS 0.21). It now shows only from a page's first
render, so it lands at the top of the next page they open (owner, 18 Nov: "everything needs to be stable"). Added to
`main`: 3 files, +8 −3 (`git diff d01b78ad 678508df`). Shipped on the owner's "ship it #642" in the Desk
(lane:standard), after the owner's "try it #642" on `mobile-next`.

| Item | Value |
|---|---|
| PR | #642 |
| Head | `6f3c9849` |
| Merge commit | `678508df` |
| Production deploy | 7881945402, success |
| Rollback target | deploy 7881878871 (`d01b78ad`, #644) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `6f3c9849` | passed (6/6) |
| Typecheck, lint, unit, check:perms, `audit:prod` (Build) | `bb511591` | all passed; typecheck, lint, check:perms again on `6f3c9849` |
| Full e2e | `bb511591` | 124 passed, 1 skipped, 1 failed (15.9 min; load 5.8 at start, 9.2 at end): `getting-started.spec.ts:36`, the "Your link is copied." toast not seen within 15 s on a page without the feedback ask |
| e2e re-run of the failed spec, alone, twice | `bb511591` | 2 passed each (20.3 s and 18.8 s); accepted as a flake by the Desk and Safety |
| CLS of the 5th Keep (Build, local seeded server, desktop 1280) | `bb511591` | 0.0000; the ask appears on the next page |
| Merge with `main` | `7fdd33d5`, then `d01b78ad` | merged into the branch as `6f3c9849`, own lines unchanged; against `d01b78ad` `git merge-tree` clean, only `docs/product/receiver.md` touched by both, so the e2e carries over |
| Safety review | `bb511591`, then `6f3c9849` | cleared |
| On `mobile-next` for the owner's try | `6f3c9849` (`047838e8`) | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #643, report for #609: merge `4b99768d`, deploy 7881787904.
- #644, report for #581: merge `d01b78ad`, deploy 7881878871.

## After the merge
`main` merged into `mobile-next` as `f49b2d8c`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581) and the feedback ask fix. Ready for the owner's word: the e2e test fix (#635,
now that #642 is live), the Review Queue redesign, option 42 (#601, on `mobile-next` for the owner's try, e2e passed). On `mobile-next` for the owner's try, e2e passed, being marked ready:
the coming-soon page with day glass (#625). e2e running: the sign-in day glass (#641). On `mobile-next`, e2e queued: the
expanded player (#600). Next build: wave detail (build/wave-rms).

## Corrections (added after merge)
This report was first filed as `2026-11-19-release-642-feedback-card.md`; the release was on 18 Nov. Earlier wording said
#601 and #625 were "tried"; the owner had not yet given a try result for them then, so it now says they were on
`mobile-next` for the owner's try. #601 is the whole Review Queue redesign (option 42), not a small fix. The reports
for #609 (`2026-11-19-release-609-settings.md`) and #581 (`2026-11-19-release-581-projects-rights.md`) also carry
19 Nov in their names and titles; both releases were on 18 Nov.
