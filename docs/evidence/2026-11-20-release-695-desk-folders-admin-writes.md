# Release: #695, desk folders: only the owner and A&R / Admins change them, in the database too (20 Nov 2026)

Board #25. Everyone on the desk still reads folders. Creating, renaming and deleting a folder now needs `ft_desk_admin`
in the database as well, matching the app's `requireRole("admin")`. Migration `0158_desk_folders_admin_writes` drops
`person_desk_folders` and the four 0153 policy names with `if exists`, then creates read (`ft_desk`) and
insert/update/delete (`ft_desk_admin`) policies. Grants are unchanged; update stays limited to `name`. No new packages.
Changed on `main`: 3 files, +125 −1 (`git diff 3d5ff51d c930346e`): `src/lib/db/migrations.ts`,
`tests/desk-folders-admin-writes.test.ts` and `docs/05-data.md`. Shipped on the owner's "ship it #695" typed in the Desk
(lane:owner); the PR was marked ready from draft just before.

| Item | Value |
|---|---|
| PR | #695 |
| Head | `697ea041` |
| Merge commit | `c930346e` |
| Production deploy | 7951377535, success (`vercel-build` ran migration 0158) |
| Rollback target | deploy 7951069387 (`3d5ff51d`, #706), code only |

**Rollback does not undo the database change.** Rolling back the code leaves the 0158 policies in place. That is safe
for the old code, which already allows folder writes only to admins and the owner. Putting back 0151's single policy
needs a new migration.

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `697ea041` | passed (6/6) |
| Typecheck, lint, unit (1083/1083), check:perms, `audit:prod` (Backend session) | `697ea041` | all passed |
| Permission test: Member and stranger refused, admin and owner allowed, cover upload 403/200, `art_key` update denied | `697ea041` | passed; fails without 0158 |
| e2e: full suite | `697ea041` | passed earlier on 20 Nov (Safety) |
| e2e: folders and folder-drop specs on the merge result | | not run (optional per Safety; e2e signs in as owner or admin, whom 0158 still allows) |
| Safety review | `697ea041` | cleared, re-checked against `3d5ff51d` |
| Merge with `main` | `3d5ff51d` | GitHub CLEAN; merged without conflicts |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- None besides #706, which has its own report (#714, not merged yet).

## After the merge
`main` merged into `mobile-next` as `a744bd05`, no conflicts; the test link points at that build.

## Follow-up
`backend/folder-art` must drop its 0153 before it merges, or it fails with "policy already exists" (board #26).

## Live versus unfinished
Live: as in the #706 report, plus admin-only folder writes in the database. Ready for the owner: reports #707 to #710,
#712, #713 and #714. Draft: the StoreKit test setup (#705). Conflicting with `main`: review card option 1 (#691) and the
plans draft (#674).
