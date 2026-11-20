# Release: #686, drop files or folders on Projects, a project or a stems receipt (20 Nov 2026)

Drag and drop for files and whole folders on laptop and desktop; phones keep their pickers. Dropping on Projects opens
the upload with the WAV and MP3 files ready, and one folder dropped on its own becomes a new project named after it.
Dropping inside a project adds the tracks to that project. Senders can drop stems, or a folder of them, on a receipt
(the stem limit still applies). The Send page release drop uses the same shared reader. Music-software project files
are skipped, and one line names what was skipped. No new routes, migrations or packages. Added to `main`: 12 files,
+394 −31 (`git diff 90c94f51 5babee0f`). Shipped on the owner's "ship it #686" typed in the Desk (lane:standard), after
it was on `mobile-next` for the owner's try.

| Item | Value |
|---|---|
| PR | #686 |
| Head | `08f7c559` |
| Merge commit | `5babee0f` |
| Production deploy | 7935967979, success |
| Rollback target | deploy 7930680183 (`90c94f51`, #692) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `08f7c559` | passed (6/6) |
| Typecheck, lint, unit, check:perms, `audit:prod` (Build session) | before the merge with `main` | all passed |
| e2e: full suite, including `folder-drop.spec.ts` | before the merge with `main` | 131 passed, 0 failed (19 min) |
| Merge with `main` | `43e2974e` | merged into the branch as `08f7c559`; one line resolved in `projects/page.tsx` (`pageDrop="project"`), `receiver.md` keeps both sides; GitHub CLEAN against `90c94f51` |
| Safety review | `08f7c559` | cleared, with `main` `43e2974e` merged in; the rest identical to the cleared branch |
| On `mobile-next` for the owner's try | | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #692, report for #675: merge `90c94f51`, deploy 7930680183.

## After the merge
`main` merged into `mobile-next` as `d0659a81`, no conflicts.

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606), the sign-in screens (#617), Collections covers (#621), Settings
(#609), the Projects rights change (#581), change cover (#669), the receipt limit (#683), the code email (#688), tap to
play with pause (#680), the Projects page (#675) and folder drag and drop. On `mobile-next` for the owner's try: the
compact review card (#681), the volume reveal (#684), the clearer player buttons (#687). Ready for the owner's try:
review card option 1 (#691, e2e 12/12, Safety cleared at `3b429cb9`; merges after #681). Being built: Collections step 1
(#693, option 66; Safety cleared at `d15d8f7e`, e2e not run yet).
