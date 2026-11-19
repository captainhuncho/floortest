# Release: #667, Delete project asks before closing its menu (19 Nov 2026)

Bug fix: in Projects, choosing Delete project now opens its confirmation before the menu closes, so the confirmation
can no longer be lost with the menu. Client only: `src/app/dashboard/projects/ProjectsUI.tsx`, 1 file, +10 −4. The
`deleteProject` server action and its role check are unchanged, and the confirmation still gates the delete.
lane:auto. Shipped on the owner's "ship it #667" in the Desk. It was on `mobile-next` for the owner's try from the
owner's "try it" typed in BUILD (19 Nov).

| Item | Value |
|---|---|
| PR | #667 |
| Head | `b22491b6` |
| Merge commit | `417620e0` |
| Production deploy | 7908740161, success |
| Rollback target | deploy 7904813396 (`9998a1a6`, #666) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `b22491b6` | passed (6/6) |
| Typecheck, lint (0 errors), unit tests, check:perms, `audit:prod` (BUILD) | `b22491b6` | all passed |
| e2e | | not required: no change to sending, review, downloads, receipts or auth |
| Merge with `main` | `9998a1a6` | GitHub CLEAN |
| Safety review | `b22491b6` | cleared |
| On `mobile-next` for the owner's try | `b22491b6` (`2182fafa`) | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #666, report for #597: merge `9998a1a6`, deploy 7904813396.

## After the merge
`main` merged into `mobile-next` as `584a4b98`, no conflicts.

## Live versus unfinished
Live: the played-out read action (#597, not used on screen yet) and this fix. Shipped after it, report in this PR:
callout tick follow-ups (#668). On `mobile-next` for the owner's try: folder covers (#663),
Send music (#662, draft), Change cover for projects and folders (#669, migrations 0156 and 0157). Draft, not yet sent
for review: the Activity redesign (#670). Waiting for covers on `main`: the volume reveal and the six clearer player
buttons (local, tests passed).
