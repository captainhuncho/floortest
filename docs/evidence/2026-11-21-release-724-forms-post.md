# Release: #724, forms always post (21 Nov 2026)

Every form now posts. A guard test (`tests/forms-post.test.ts`) keeps it that way. 53 files, +123 −55, no migrations.
Urgent lane: the owner said "try it 1" in the Desk (on `mobile-next` as `9b7f4828`), then "ship it #724".

| Item | Value |
|---|---|
| PR | #724 |
| Head | `34d60e1b` |
| Merge commit | `5e16302c` |
| Production deploy | `dpl_HC5qEzcmM3RihA1LwgUyQEXhhJuz`, ready |
| Rollback target | `dpl_E3k37tFGjV9ge5WPLYUpQ6DSixp1` (`ca485cad`, #723) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `34d60e1b` | all green before the merge; GitHub CLEAN |
| Typecheck, lint, `check:perms`, `audit:prod` (BUILD) | `34d60e1b` | passed |
| Unit | `34d60e1b` | 1091 passed, 0 failed (first run under load ~60 had one native V8 crash in `tests/sender-link.test.ts`; it passed alone and the full rerun was clean) |
| e2e: full suite | `34d60e1b` | 134 passed, 1 skipped (the deliberate one), 0 failed, 20.5 min |
| Safety review | `34d60e1b` | cleared for ship; test-link merge verified |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |
| Live `/login` form | production | `method="post"` |

## Other releases since the last code report
- #723, report for #721: merge `ca485cad`, deploy `dpl_E3k37tFGjV9ge5WPLYUpQ6DSixp1`.

## After the merge
`main` merged into `mobile-next` as `d68fcba7`, no conflicts; the test link points at it.

## Live versus unfinished
Live: as in the #721 report, plus this fix. On the test link, not shipped: the iPhone lock-screen player (#722; e2e
and device check before ship). Waiting: Backend's folder dialog keyboard fix (no PR yet); the StoreKit test setup
(#705, draft). Owner: home Site content edit (board #80). Conflicting with `main`: #691 and #674.
