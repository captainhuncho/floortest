# 15 Oct 2026: two-step sign-in for team owners, Neon notes (28b9d5b)

## Build

- Production commit: `28b9d5b` (main), deployment `dpl_CN77ucniXyfbLJMjvUwZMagS2xpC`, READY.
- Preview: `6f347db` (mobile-next), same changes merged.
- Also in this deployment, shipped earlier by another session and not re-checked here: `774b06a` (an e2e wait in the core send test).

## What shipped

| Change | Commit |
|---|---|
| Team owners manage the team (invite, cancel invite, change role, remove, reply approval) only with two-step sign-in on; the Team page links to Security until then; working the desk, approving held replies and leaving need nothing more | `9a437a5` |
| Pentest brief to hand to a tester (`docs/pentest-brief.md`); launch list item 10 | `9a437a5` |
| Neon: free plan now, Launch before public launch; runbook rewind steps | `docs-neon-launch` branch, docs only |
| Plan Done list tidied (merge markers removed) | `7d570dc`, `d411a0b` |

## Checks

| Check | Build | Result |
|---|---|---|
| Typecheck | 28b9d5b (merged main) | passed |
| Lint, 0 errors | 28b9d5b | passed |
| Permission checks (ops, desk roles, row-level security on 60 tables) | 28b9d5b | passed |
| Unit tests, 103 incl. the new owner two-step test | 28b9d5b | passed |
| Full e2e, 40 tests incl. teams spec turning two-step on for the owner and signing in with a code | 9a437a5 (branch) | passed |
| Full e2e on the merged main | 28b9d5b | blocked: not run after merging; the merge added only docs and the e2e wait from 774b06a, which another session tested |
| Production deploy | 28b9d5b | passed (READY) |
| Team page on the live site, owner without two-step sees the notice | 28b9d5b | blocked: needs a real owner account signed in on floortest.app; the site is gated and no test owner exists in production |

## Status

- **Built:** owner two-step rule in `src/lib/account-members.ts`, Team page notice, tests, docs.
- **Tested:** on the branch end to end, and unit-level on the merged build.
- **Live:** yes, on floortest.app since this deployment.
- **Unfinished:** the live check of the Team page above; passkeys (open, after the beta week).

## Rollback

- Last good deployment before this one: `dpl_FzeqKhpyZk2v7yGvxyZwu9GoLTfg` (774b06a). Rolling back to it removes only the owner rule and docs; safe.
- Do not roll back past `04898b8` (password ship): upgraded password hashes (`scrypt$15$8$3$…`) can't be read by older code, so anyone signed in since would be locked out.
- No migration in this release.

## Next

The live Team page check, the first time a real owner without two-step opens it.
