# Release: #591, Analytics (17 Nov 2026)

Analytics: desk numbers and shared links, for the owner and A&R / Admin. 16 files, +903 −97, no migrations.

| Item | Value |
|---|---|
| PR | #591 |
| Head | `b139c480` |
| Merge commit | `ae19fce6` (parents `d4dcc5b7` + `b139c480`) |
| Production deploy | 7850354719, success |
| Rollback target | deploy 7848915432 (`d4dcc5b7`, #604) |

## How it shipped
The owner typed "ship it #591" in the Safety session, and Safety ran `gh pr merge 591 --merge` at 10:17 UTC. This is
outside the working rule that only the Desk merges and release words count only when typed in the Desk; it is
reported to the owner. The Desk did the rest of the ship (deploy check, `main` into `mobile-next`, this report).

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `b139c480` | passed |
| Typecheck, lint (0 errors), unit, check:perms, audit | `b139c480` | passed |
| Full e2e (quiet) | `b139c480` | failed 1: `label-send:43`, a test-only wait bug fixed by #604 (already in `main`) |
| `label-send` alone, quiet, separate runs | `b139c480` | passed 2/2, then 3/3 more (load 4–11) |
| Safety review | `b139c480` | cleared (FilterMenu change is a default-false prop the queue doesn't pass) |
| Post-merge: parents, tree equals merge-tree, ls-remote | `ae19fce6` | verified by Safety |
| Health `/api/health` | production | 200 |

## After the merge
`main` merged into `mobile-next` as `41d795fd` (no file changes: #591 was already there for the owner's try).

## Also listed
#605, the release report for #604, is open (docs/evidence only) and ships on its own word.

## Live versus unfinished
Live: Analytics for owners and A&R / Admins. Known test flake, not in this change: `tests/site-lock.test.ts` times out
under heavy machine load (board #25, test-only fix pending).
