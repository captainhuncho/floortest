# 18 Oct 2026 · The 15 standard docs (docs only)

## Build

- **Production:** `cacb29a` (fast-forward of `main` from `28b9d5b`), deployment `dpl_4Wr1Q8qLTE4HQe3vtvrjor2NwJX1`, state READY.
- **Preview:** `mobile-next` gets `cacb29a` through the merge commit that carries this report.

## What shipped

- `cacb29a`: `docs/1. PRD.md` to `docs/15. Debugging.md` (the owner's rule of 18 Oct: every project has these 15 files), each a short index that links to the existing doc that stays the source of truth; one row each in `CLAUDE.md` and `AGENTS.md` so they're kept in step. No code, no migrations.

## Checks

| Check | Build | Result |
|---|---|---|
| `npm run typecheck` | `cacb29a` | passed (after `next typegen`, which a fresh worktree needs for the generated `RouteContext` types) |
| `npm run lint` | `cacb29a` | passed, 0 errors |
| `npm test` | `cacb29a` | passed, 103 of 103 |
| `npm run check:perms` | `cacb29a` | passed |
| `npm run e2e` | — | not run: no change to sending, review, downloads, receipts or auth |
| Session check-in | — | passed: FLOORTEST, "Stop old tabs overwriting newer saves" and "Enforce team roles in the database" all said go (the last two work on IMSS, not FloorTest) |
| Production deploy | `cacb29a` | passed: Vercel READY |
| `https://floortest.app/api/health` | `cacb29a` | passed: `{"ok":true,"checks":{"database":"ok"}}` (built-in browser) |
| Links in the 15 docs | `cacb29a` | passed on `mobile-next`; on `main` two links (`working.md`, `evidence/`) resolve once the next `mobile-next` release reaches `main` |

## Status

Built, checked and live on production. Docs only, so nothing changes for users. Unfinished: none.

## Rollback

Last good deployment: `dpl_CN77ucniXyfbLJMjvUwZMagS2xpC` (`28b9d5b`). Rolling back is safe: no migrations or data changes.

## Next

Today's production release is used; the beta release goes on its own day.
