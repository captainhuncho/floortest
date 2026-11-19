# Release: #597, Played out state for the expanded player (19 Nov 2026)

A read action (`playerTrackState`) that tells the expanded player whether the signed-in desk owner has played a track
out; it returns null for Members and label desks, in line with #633. Nothing on screen uses it yet: the player wiring
follows as its own change, with its own Safety review and the owner's try. Added to `main`: 4 files, +87 −3
(`scripts/check-desk-roles.ts`, `src/app/dashboard/actions/review.ts`, `src/lib/desk.ts`,
`tests/player-track-state.test.ts`). lane:standard. Shipped on the owner's "ship it #597" in the Desk, after the Desk
advised holding it for the player wiring; no owner try was possible because nothing on screen changes.

| Item | Value |
|---|---|
| PR | #597 |
| Head | `503b55b5` |
| Merge commit | `5bf0c8b8` |
| Production deploy | 7903364055, success |
| Rollback target | deploy 7901251222 (`186a0f08`, #665) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `503b55b5` | passed (6/6) |
| Typecheck, lint (0 errors), check:perms, `audit:prod` (Backend) | `503b55b5` | all passed |
| Tests: `player-track-state`, played-out permission | `503b55b5` | 4 passed, 0 failed |
| e2e | | not required: no change to sending, review screens, downloads, receipts or auth, and no UI calls it |
| Merge with `main` | `186a0f08` | merged into the branch as `503b55b5`; GitHub CLEAN |
| Safety review | `503b55b5` | cleared (backend only; the read only narrows access) |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #665, reports for #661 and #664: merge `186a0f08`, deploy 7901251222.

## After the merge
`main` merged into `mobile-next` as `c08c2eef`, no conflicts.

## Live versus unfinished
Live: the compact track page (#661), the picomatch exception removed (#664) and the played-out read action (not used
on screen yet). On `mobile-next` for the owner's try, e2e passed and Safety cleared: folder covers (#663), Send music
(#662, draft). On `mobile-next`, Safety cleared, PR not opened yet: Delete project asks before closing its menu
(`b22491b6`). Waiting for covers on `main`: the volume reveal and the six clearer player buttons (local, tests passed).
