# Release: #594, floating player and menu pair (17 Nov 2026)

On phones the mini player floats just above the bottom menu as one pair (Floor, Collections, Queue, Prepare, More); on
laptops one compact player bar floats centred over the page. Owner's pick, 16 Nov (option 27). 14 files, +630 −121.
Shipped on the owner's "ship it #594" in the Desk (lane:standard). An earlier "ship it #594" was blocked by the guard
because it arrived mid-turn; the owner sent it again on its own.

| Item | Value |
|---|---|
| PR | #594 |
| Head | `2e759525` |
| Merge commit | `5b311767` |
| Production deploy | 7857981720, success |
| Rollback target | deploy 7856061507 (`224447e6`, #616) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `2e759525` | passed |
| Unit, typecheck, lint, check:perms, `npm audit --omit=dev` | `2e759525` | 976/976, all exit 0, 0 vulnerabilities |
| Full e2e | `57478d9c` | 124 passed, 1 skipped (ops-overview.spec.ts:49, skipped in the spec), 0 failed |
| Targeted e2e after merging main | `2e759525` | 12 passed, 0 failed: player-pair, player-renders, fresh-link, collection-panel, folders, batch (list set by Safety) |
| Safety review | `2e759525` | cleared; the one conflict (`src/lib/player-track.ts`) is the exact union of #594's `toPlayer` and main's `musicToPlayer` |
| On `mobile-next` for the owner's try | | yes, before the ship; the owner's word was "ship it #594" |
| Health `/api/health` | production | 200, database ok |

## After the merge
`main` merged into `mobile-next` as `bb150163`. Docs conflicts only, resolved to match the code now on `mobile-next`:
`docs/03-app-flow.md` (the phone menu from #594 with its More sheet; the desktop sidebar from #609, Settings) and
`docs/product/receiver.md` (kept `mobile-next`'s player, top bar and link page rows).

## Live versus unfinished
Live: the player and menu pair on phones and the compact bar on laptops.
Open: on `mobile-next`, #609 (Settings, option 47) takes Contacts and Activity out of the desktop sidebar, while #594's
phone More sheet still lists them. Both are on the test link; which way it goes is the owner's call before #609 ships.
On the test link, waiting for e2e and renders: #601, #609, #610, #611, #613.
