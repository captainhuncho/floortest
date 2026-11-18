# Release: #617, sign-up and log-in, option 54 batch 1 (18 Nov 2026)

The new sign-in screens (option 54, batch 1): the welcome story, the end card, log in, the photo background and the glass
layer, with a darker night tone (`3f7362dc`). Added to `main`: 14 files, +967 −105 (`git diff b9b9b9ee 1b35bb20`).
Shipped on the owner's "ship it #617" in the Desk (lane:standard), after the owner tried it on `mobile-next`: "the
sign-in screens look good". The owner then asked for a glass card behind the content in day mode on photo screens; that
follows as its own change (coming-soon page #625 first, then these day screens).

| Item | Value |
|---|---|
| PR | #617 |
| Head | `3f7362dc` |
| Merge commit | `1b35bb20` |
| Production deploy | 7871634049, success |
| Rollback target | deploy 7871417732 (`b9b9b9ee`, #638) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `3f7362dc` | passed (6/6) |
| Unit, typecheck, lint, check:perms, `audit:prod` (option 54 session) | `3f7362dc` | all passed |
| Full e2e | `3f7362dc` | 125 passed, 1 skipped, 1 failed (23.8 min, load 15 at start, 57 at end): `account-security.spec.ts:15` hit the 90 s timeout as the first test on a cold server; the page had already reached two-step on the Security page |
| e2e gate set by Safety: `account-security.spec.ts`, two separate solo runs | `3f7362dc` | 2 passed each (24.2 s and 22.9 s; `:15` at 11.1 s and 10.0 s) |
| Merge with `main` | `b9b9b9ee` | `git merge-tree` clean; no overlap under `src/app/(auth)` |
| Independent review (santa) and Safety review | `3f7362dc` | passed and cleared |
| On `mobile-next` for the owner's try | | yes, before the ship (with #625, from the sign-in session) |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #638, report for #606: merge `b9b9b9ee`, deploy 7871417732.

## After the merge
`main` merged into `mobile-next` as `cc9abc92`, no conflicts. Before that, on the owner's word in the Desk,
`mobile-next` dropped `e2e/mobile-send.spec.ts` (`98b449a2`; the owner closed #585, copy kept on `build/mobile-send`),
and #526 was closed (its change shipped on 14 Nov in #538).

## Live versus unfinished
Live: Floor (#596), Analytics (#599), Prepare (#606) and the sign-in screens. Next: Collections covers (#621, folder e2e
running or next). The coming-soon page (#625) waits for the day-mode glass card the owner asked for. Settings (#609) is
lane:owner and needs the owner's yes. Projects rights tick (#581) needs its e2e and legal item 13. On hold: expanded
player (#600).
