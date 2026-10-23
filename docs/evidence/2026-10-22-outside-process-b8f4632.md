# Production at b8f4632: shipped outside the release process (22 Oct 2026)

## Build
- `main` moved from `863b4a0` (the 22 Oct ops-hardening release) to `b8f4632`, a `mobile-next` commit, by a push at **2026-10-22 03:04 UTC** from a worktree on the owner's Mac (shared git log: "update by push"). No "ship it", no check-in with the sessions, no report at the time.
- Production deployment `dpl_DUg4Dq4kAmWqcqvY1HdujbEHpdfE`, READY; `/api/health` ok when checked on 23 Oct.
- Kept by the owner on 23 Oct: "Keep b8f4632 in production. … record b8f4632 in docs/evidence as shipped outside the process."

## What shipped
Code changes between `863b4a0` and `b8f4632` (19 files; no database migration):
- Private files go through one check, `src/lib/file-access.ts` (`2f53331`, Codex review 19 Oct): playback, download, the app, stems, artwork and offline copies. Test `tests/file-access.test.ts`.
- Footer: Follow link to FloorTest's Instagram (`src/lib/site.ts`, test `tests/site-footer.test.ts`).
- Email editor preview shows the "Stop these emails" line (`EmailEditor.tsx`, `email-copy.ts`, `onboarding.ts`, `played-out-prompt.ts`).
- Two links raised to the 24 px touch minimum (home, pricing).
- iOS app project file and Capacitor config (no effect on the website).
- Docs and plan updates.

## Checks
| Check | Result |
|---|---|
| Release checks before the push (typecheck, lint, tests, check:perms, e2e) | blocked: not recorded; the push skipped the process. The same code passed them on `mobile-next` before it reached Preview (`b8f4632`), and again inside the Next.js 16.4.1 release built on top of it (`c846b4f`, see its report) |
| Production deploy | passed: READY (`dpl_DUg4Dq4k…`) |
| `/api/health` | passed (23 Oct) |

## Status
Live since 22 Oct 03:04 UTC and kept by the owner. Who pushed it isn't recorded; the sessions working that day say they didn't.

## Rollback
Promote the deployment built from `863b4a0`. Safe: no migration between the two.

## Next
Ship only through "ship it" in the session doing the release (working rule 2).
