# Release: #675, the Projects page redesign (option 63 A) (20 Nov 2026)

The Projects page redesign (option 63 A): a new Projects bar, folder list and rows, the track list with tap to play and
pause (the #680 rule), and a loading skeleton in the page's layout. Added to `main`: 10 files, +250 −78
(`git diff d965f5e6 43e2974e`). Shipped on the owner's "ship it #675" typed in the Desk (lane:standard), after it was on
`mobile-next` for the owner's try. The owner's first "ship it #675" could not merge because #675 conflicted with `main`
after #680; the owner sent it again once the merged head was cleared.

| Item | Value |
|---|---|
| PR | #675 |
| Head | `4c15a81f` |
| Merge commit | `43e2974e` |
| Production deploy | 7930577309, success |
| Rollback target | deploy 7929989630 (`d965f5e6`, #690) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `4c15a81f` | passed (6/6) |
| Typecheck, lint (0 errors), unit (1073/1073), check:perms, `audit:prod` (Projects session) | `4c15a81f` | all passed |
| e2e: `batch`, `folders`, `no-collection`, `teams` specs | `4c15a81f` | 11 passed, 0 failed, run under the load gate |
| Earlier e2e of the same specs | `f625318b` | 11 passed, 0 failed |
| Merge with `main` | `565708bf` | merged into the branch as `4c15a81f`; conflict in `MusicList.tsx` only, resolved to the #680 rule; Safety confirmed the PR's other lines unchanged; GitHub CLEAN against `d965f5e6` |
| Safety review | `f625318b`, then `4c15a81f` | cleared |
| On `mobile-next` for the owner's try | `f625318b` | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #690, report for #680: merge `d965f5e6`, deploy 7929989630.

## After the merge
`main` merged into `mobile-next` as `c4d40974`. `MusicList.tsx` conflicted, because `mobile-next` still had the
`f625318b` copy. It was resolved by taking `main`'s copy, which is identical to the cleared `4c15a81f`.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581), change cover (#669), the receipt limit (#683), the code email (#688), tap to
play with pause (#680) and the Projects page. On `mobile-next` for the owner's try: folder drag and drop (#686, being
merged with `main`), the compact review card (#681), the volume reveal (#684), the clearer player buttons (#687). Ready
for the owner's try: review card option 1 (#691, e2e 12/12, Safety cleared at `3b429cb9`; merges after #681). Being built: Collections step 1 (option 66).
