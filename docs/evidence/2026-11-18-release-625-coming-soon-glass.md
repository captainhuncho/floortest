# Release: #625, coming-soon page with the day glass card (18 Nov 2026)

The coming-soon page in day mode gets a glass card behind its content over the photo (the owner, 18 Nov: "let's build a
glass effect to elevate the assets in the day mode"), with the gate and waitlist as sheets on that card. Added to
`main`: 11 files, +407 −126 (`git diff 678508df 449e1a6d`). Shipped on the owner's "ship it #625" typed on its own in
the Desk (lane:standard), after the change was on `mobile-next` for the owner's try.

| Item | Value |
|---|---|
| PR | #625 |
| Head | `af34d37c` |
| Merge commit | `449e1a6d` |
| Production deploy | 7883222346, success |
| Rollback target | deploy 7881945402 (`678508df`, #642) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `af34d37c` | passed (6/6) |
| Full e2e (includes `site-lock.spec.ts`, extended in this PR) | `af34d37c` | 126 passed, 1 skipped, 0 failed (15 min 58 s; load 9.1 at start, 11.1 at end) |
| Merge with `main` | `678508df` | `git merge-tree` clean; only `docs/03-app-flow.md` touched by both, so the e2e carries over |
| Safety review | `af34d37c` | cleared |
| On `mobile-next` for the owner's try | `af34d37c` (`a589411e`) | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None merged. The report for #642 (#645) is open.

## After the merge
`main` merged into `mobile-next` as `7b3bdb78`; no file changes, since `mobile-next` already had #625.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581), the feedback ask fix (#642) and the coming-soon day glass. Ready for the
owner's word: the e2e test fix (#635). On `mobile-next` for the owner's try: Review Queue keeps its place (#601, e2e
passed), the sign-in day glass (#641, e2e passed). e2e running: the expanded player (#600). Next build: wave detail
(build/wave-rms).
