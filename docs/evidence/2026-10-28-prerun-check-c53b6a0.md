# 28 Oct 2026: live version checked before the five-person run (c53b6a0)

## Build

- Checked: `c53b6a0`, the production commit (merge of PR #24, `security-coop`), unchanged since the 27 Oct release.
- Run from a clean checkout of `origin/main` (fresh worktree, no `.next` or `.e2e` left over).
- Nothing shipped. This is the starting point for the run on Thu 29 – Sat 31 Oct ([prebeta-run.md](../prebeta-run.md)); plan Phase A item 5.

## Checks

| Check | Build | Result |
|---|---|---|
| `npm run typecheck` | c53b6a0 | passed |
| `npm run lint` | c53b6a0 | passed (0 problems) |
| `npm test` | c53b6a0 | passed (135 of 135) |
| `npm run check:perms` | c53b6a0 | passed (every desk action and route checks its caller; row-level security on all 65 tables, per-person rules on 12) |
| `npm audit --omit=dev` | c53b6a0 | passed (0 vulnerabilities) |
| `npm run e2e` | c53b6a0 | passed (45 of 45, 3.8 min; includes isolation, fresh-link and reply-feedback) |

## Status

- **Live and checked:** everything in production at `c53b6a0`.
- **Not live, kept out of the run:** PR #26 (nonce CSP; fails 9 e2e with COOP, under investigation) and PR #22 (hold-and-scan). Testers use the live site as checked here.
- **Still open before the run (owner):** the testers' names, the invites and the site password; the first offsite vault run and restore drill (B6).

## Rollback

- Not needed: nothing changed. Last good release remains `c53b6a0`; before it `dfefa91`.
