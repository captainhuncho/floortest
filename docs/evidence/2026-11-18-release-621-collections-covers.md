# Release: #621, Collections covers (option 57 I) (18 Nov 2026)

Collections with covers (option 57 I): cover art on collection and folder pages, with small thumbnails served through
`?size=thumb` on `/api/collection-art` and `/api/track-art` after each route's existing owner or public-link checks.
Added to `main`: 46 files, +266 −47 (`git diff 63da81e8 48486710`). Shipped on the owner's "ship it #621" in the Desk
(lane:standard), after the owner tried it on `mobile-next` with Floor, Analytics and Prepare: "They look good, close to
the design."

| Item | Value |
|---|---|
| PR | #621 |
| Head | `49d70d5a` |
| Merge commit | `48486710` |
| Production deploy | 7872540242, success |
| Rollback target | deploy 7871724857 (`63da81e8`, #639) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `49d70d5a` | passed (6/6) |
| Typecheck, lint (0 errors), unit (1021/1021), check:perms, `audit:prod` (covers session) | `49d70d5a` | all passed |
| e2e: `collection-panel.spec.ts`, `core-loop.spec.ts`, `folders.spec.ts` | `49d70d5a` | 6 passed, 0 failed (4.4 min, 1 worker; load 49 at start, 165 at end) |
| Earlier e2e of the same specs | `fb713565` | 2 passed, 2 failed on the 90 s timeout (pages had rendered), 2 skipped; load rose from 10.5 to 381 during the run (Spotlight indexing), so it was re-run on the main-merged head above |
| Earlier e2e, collections and projects specs | `c0c35bec` | 3 passed, 0 failed |
| Merge with `main` | `63da81e8` | merged into the branch as `49d70d5a`, no conflicts; Safety confirmed the PR's own lines unchanged |
| Safety review | `c0c35bec`, then `49d70d5a` | cleared |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/`, `/login` | production | 200, 200, 200 |

## Other releases since the last code report
- #639, report for #617: merge `63da81e8`, deploy 7871724857.

## After the merge
`main` merged into `mobile-next` as `d87f6f77`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617) and Collections covers. Follow-up for the
improvement round: cover thumbnails are not cached yet (Safety, P3). Tried by the owner and waiting for e2e: Settings on
one page (#609, lane:owner, needs the owner's yes) and the coming-soon page with the day glass card (#625). e2e queue:
#609, #581 (also needs legal item 13), #635, #601, #625. On hold: expanded player (#600).
