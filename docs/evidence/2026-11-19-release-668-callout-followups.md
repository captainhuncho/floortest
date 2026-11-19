# Release: #668, Callout tick follow-ups from the #583 review (19 Nov 2026)

Server and tests only, nothing on screen: follow-ups to the Member callout tick from the #583 review, which only narrow
access. 4 files, +65 −9 (`SECURITY.md`, `src/app/dashboard/actions/account-team.ts`, `src/lib/account-members.ts`,
`tests/member-callouts.test.ts`). No migration. lane:standard. Shipped on the owner's "ship it #668" in the Desk; no
owner try was possible because nothing on screen changes.

| Item | Value |
|---|---|
| PR | #668 |
| Head | `b95ea986` |
| Merge commit | `5d377d28` |
| Production deploy | 7909443169, success |
| Rollback target | deploy 7908740161 (`417620e0`, #667) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `b95ea986` | passed (6/6) |
| Typecheck, lint (0 errors), check:perms, `audit:prod` (Backend) | `b95ea986` | all passed |
| Tests: `member-callouts`, `collection-art-access`, `collection-routing` | `b95ea986` | 10 passed, 0 failed |
| e2e | | not required: no change to sending, review screens, downloads, receipts or auth flows on screen |
| Merge with `main` | `417620e0` | GitHub CLEAN; the branch is off `5bf0c8b8` and shares no file with #666 or #667 |
| Safety review | `b95ea986` | cleared |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
None (the #667 report is in the same PR).

## After the merge
`main` merged into `mobile-next` as `6a69d416`, no conflicts.

## Live versus unfinished
Live: the played-out read action (#597), the Delete project fix (#667) and these follow-ups. On `mobile-next` for the
owner's try: folder covers (#663), Send music (#662, draft), Change cover for projects and folders (#669, migrations
0156 and 0157). Draft, not yet sent for review: the Activity redesign (#670). Waiting for covers on `main`: the volume
reveal and the six clearer player buttons (local, tests passed).
