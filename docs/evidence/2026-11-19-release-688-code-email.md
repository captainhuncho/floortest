# Release: #688, code emails show the code in boxes (19 Nov 2026)

Sign-in and verification code emails show the code one character per box, and also once as a single unbroken string,
so mail apps can recognise it (Gmail's "Copy code", Apple Mail autofill). The subject stays code-free (owner, 29 Oct).
Added to `main`: 3 files, +47 −4 (`git diff 5c7cf1e2 c3aca53f`). Shipped on the owner's "ship it #688" in the Desk
(lane:standard), after the owner saw the rendered email at 320, 390 and 900 px, day and night.

| Item | Value |
|---|---|
| PR | #688 |
| Head | `358906a3` |
| Merge commit | `c3aca53f` |
| Production deploy | 7924392078, success |
| Rollback target | deploy 7913953617 (`5c7cf1e2`, #685) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `358906a3` | passed (6/6; `close` skipped) |
| Typecheck, lint, unit (`email-html` 10/10), check:perms, `audit:prod` (Build) | `358906a3` | all passed |
| e2e | | not run: no auth flow changed |
| Merge with `main` | `5c7cf1e2` | GitHub CLEAN |
| Safety review | `358906a3` | cleared |
| Owner's try | rendered HTML | six renders, before the ship |
| Real mail apps (iPhone Mail autofill, Gmail "Copy code", Gmail on iPhone, Outlook) | | not tested: previews send no email; the owner checks with a live code email after the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #685, reports for #669 and #683: merge `5c7cf1e2`, deploy 7913953617.

## Correction to the #683 report
The receipt check is capped per link and per connection, in each server's memory (the report said "per link").

## After the merge
`main` merged into `mobile-next` as `499e6870`, no conflicts.

## Live versus unfinished
Live: Change cover (#669), the receipt limit (#683) and code emails. On `mobile-next` for the owner's try: the
Projects redesign (#675), folder drag and drop (#686), tap to play and Folder rename (#680), the compact review card
(#681). Waiting for the owner's "good to go": the Collections redesign drawings (option 66). With Safety: clearer
player buttons (#687, after volume reveal #684).
