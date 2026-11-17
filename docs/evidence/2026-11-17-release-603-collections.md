# Release: #603, Collections as folders with covers (17 Nov 2026)

Collections, final design (option 43): callouts and projects shown as folders with their covers. 25 files, +841 −679.
Shipped on the owner's "ship it #603" in the Desk (lane:standard). The owner looked at it on `mobile-next` and said
"Collections 603 looks right".

| Item | Value |
|---|---|
| PR | #603 |
| Head | `89aa75bb` |
| Merge commit | `c697b3da` |
| Production deploy | 7855757898, success |
| Rollback target | deploy 7855488248 (`da81db91`, #615) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `89aa75bb` | passed |
| Full e2e | `89aa75bb` | 119 passed, 1 flaky that passed on rerun |
| Safety review, two blind reviewers | `89aa75bb` | passed; one-line fix from the review (PlayAll gets player fields only, via `toPlayer`) |
| Renders (Build) | `89aa75bb` | 24 shots: phone, tablet, desktop, night and day; no sideways scroll |
| Owner's look on `mobile-next` | | "looks right" |
| Health `/api/health`, `/dashboard/collections` | production | 200, 200 |

## After the merge
`main` merged into `mobile-next` as `5d13db7f` with no file changes: #603 was already on `mobile-next` from the
owner's try.

## Live versus unfinished
Live: the Collections page as folders with covers. On the test link, waiting for the owner's try: #601 (Queue,
option 42) and #613 (sent history). The report-only releases since the last code report (#605, #607, #608, #615) are
listed in the #614 report or need no report.
