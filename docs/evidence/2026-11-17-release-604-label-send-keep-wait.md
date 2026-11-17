# Release: #604, label-send test waits for the Keep save (17 Nov 2026)

Test-only change, lane:fast. Shipped on the owner's "Ship it #604" in the Desk.

| Item | Value |
|---|---|
| PR | #604 (fix/label-send-keep-wait) |
| Head | `667f1154` (parent: main `e4fb6080`) |
| Merge commit | `d4dcc5b7` |
| Production deploy | 7848915432, success |
| Rollback target | deploy 7842029159 (`97213b66`) |

## What changed
`e2e/label-send.spec.ts`: the Keep click waited for any POST. In a full run the reply-templates POST answered first, the
test moved on and the Keep save was aborted, so `label-send:43` failed in full runs and passed alone. The wait now
matches the Keep save's request body. No app code changed.

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `667f1154` | passed |
| Typecheck, lint, unit, check:perms, audit (builder session) | `667f1154` | passed |
| label-send alone, three separate quiet runs | `667f1154` | passed (2/2 each) |
| Full e2e | `667f1154` | not run: Safety ruled a single-spec test fix needs only its own spec |
| Safety review | `667f1154` | cleared |
| Post-merge: parents, tree, ls-remote, live headers (XFO DENY, frame-ancestors 'none', HSTS, no X-Powered-By) | `d4dcc5b7` | verified by Safety |
| Health `/api/health` | production | 200 |

## After the merge
`main` merged into `mobile-next` as `2e6f679c` (only this test file changed). Typecheck and lint were not re-run on
that merge commit (the scratch checkout had no packages); the file is the one CI passed on `667f1154`.

## Live versus unfinished
Live: the test fix (affects test runs only). Unblocks clean full e2e runs for #591, #594, #600 and #601.
