# 6 Nov 2026: per-person rule follow-ups from Safety's review of #453 (#459, migration 0137)

Owner's words: in the merge commit (Desk).

## Build
- Release branch `release-2026-11-06u`, head (checked) `77d8950` = #459 head `77facdcf` (Backend, `lane:standard`,
  fast-forward on `main` `807982c`), then `main` `1baa8a7` (#462, #458) merged in cleanly. One migration
  (`0137_person_followups`), no package changes.
- Safety cleared #459 at `77facdcf`: round 3 split (owner-security-audit PASS; security-auditor FAIL on one ops-tooling
  bug, `copy-to-neon` crashing on import through `server-only`); the owner chose "fix it, then clear"; Safety checked the
  delta since `4e65b0ca` (4 files: `STAMP_TRIGGERS` moved to `src/lib/stamp-triggers.ts`, the trigger disable inside the
  try, the finally split) and confirmed the new import test fails on the old path. Both reviewers ran `main`'s
  `requestPlan` SQL against 0137: still works. CI on `77facdcf` green.
- Previous release: #451 (release #460), merge `807982c`, gate GO, deploy success, health ok; 0135 applied, 15 of 15
  accounts marked tour-seen. Then #458 (release #462, report `2026-11-06-release-9f0d23c.md`), merge `1baa8a7` on the
  owner's "Ship both" (answered in the Desk), gate GO, deploy success, health ok with the database ok.
- This release's merge commit, production deployment and the after-check go in the next release's report.

## What shipped
- A failed Settings save returns "Couldn't save" and raises an incident instead of an error page (the Desk's rollback
  note on #457).
- Migration 0137: `plan_requests.created_at` defaults to the database's time and a trigger stamps it for the person
  role, so a request can't be back-dated up ops' queue; the consent-time trigger also runs on INSERT, so sign-up consent
  times come from the database too.
- `requestPlan` withdraws and files in one transaction as the person. `scripts/check-rls.ts`: plan request decision
  fields (and plan, owner, time) never person-writable; both consent triggers must exist and be enabled.
- Ops' plan request lookup names its columns; the users CSV counts only 1 as yes for newsletter and offers.
- `scripts/copy-to-neon.ts` loads without the server build; `src/lib/restore-drill.ts` follow-ups.
- Docs: `05-data`, `operations`, `SECURITY.md`. Tests: back-dating refused and stamped now, a double submit leaves one
  waiting, sign-up consent times, a failed save shows the message, scripts import cleanly.

## Checks
| Check | Result |
|---|---|
| On `77facdc` (on `807982c`) | typecheck, lint 0 errors (5 warnings), check:perms, `npm test` 679/679, audit 0, e2e 104 passed and 1 skipped (`ops-overview`, kept on purpose by #395) in 12.8 min, no reruns |
| On `77d8950` (after `main` `1baa8a7`) | typecheck, lint 0 errors, check:perms, `npm test` 684/684; e2e: see the PR (run on this head) |
| Sender's run | #459 on `77facdcf`: Safety's targeted tests 14/14, typecheck clean; CI green. |

## Rollback
Last good deployment: #458's production deployment (`1baa8a7`). 0137 only adds a default and triggers and revokes
nothing; the previous build doesn't depend on them (its plan-request and sign-up inserts still work after 0137). An
Instant Rollback to `1baa8a7` is safe. Never roll back past `79178b3`.
