# Release: #600, the expanded player (options 27 to 30) (18 Nov 2026)

The expanded player, opened from the mini player's title or the laptop bar. Phones: full screen with Design's pick 22
"room at the top". Laptops (from 1024px): a centred card `min(70vw, 1200px)` wide and `min(80dvh, 1000px)` tall
(windows under 720px tall get up to 36rem so Keep and Not for me stay on the card), play or pause as a 56px button in
the middle of Previous and Next, then Back 15, Forward 15 and a wide volume under the actions. Up next, actions per
kind of track, modal focus rules. Also carries #651 (the queue-42 test waits for hydration before the BPM click; GitHub
marked #651 merged). Added to `main`: 13 files, +624 −55 (`git diff 502ed90e 6a469c4e`). Shipped on the owner's
"ship it #600" typed in the Desk (lane:standard), after the owner tried it on `mobile-next`: "I tried the full player
on phone and laptop: worked" (typed in Safety, on `e1f3ede4` = `5cc721a1`). Layout decisions on 18 Nov from the owner:
80% laptop card, then the 1600×1000 cap, then "option 1" width (70vw, 1200px), play/pause in the middle, "Build phone"
(pick 22) and the laptop rows.

| Item | Value |
|---|---|
| PR | #600 (with #651) |
| Head | `5cc721a1` |
| Merge commit | `6a469c4e` |
| Production deploy | 7896493094, success |
| Rollback target | deploy 7890763431 (`502ed90e`, #652) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `5cc721a1` | passed (6/6) |
| Typecheck, lint (0 errors), check:perms, `audit:prod` (OPTION-27) | `5cc721a1` | all passed |
| Unit | `5cc721a1` | 1050 passed, 0 failed |
| Full e2e | `5cc721a1` | 130 passed, 1 skipped, 0 failed (15.7 min; load 5.5 at start, 5.3 at end) |
| `queue-42`, `player-expanded`, `player-pair` | `5cc721a1` | 8 passed (an earlier run on `a9003821` failed `player-expanded.spec.ts:46` on the test's own locator, which also matched "More playback"; fixed with `exact: true`) |
| Renders, 9 sizes, night and day | `5cc721a1` | no sideways scroll, every control 44px or more, sideways phone keeps Keep / Not for me on screen |
| Merge with `main` | `502ed90e` | merged into the branch; 0 behind `main`, GitHub CLEAN |
| Safety review | `5cc721a1` (earlier heads `a0d24a28`, `81261de9`, `3642f514`) | cleared |
| On `mobile-next` for the owner's try | `5cc721a1` (`e1f3ede4`) | yes, before the ship |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #651 (queue-42 test waits for hydration), carried in #600's merge.

## After the merge
`main` merged into `mobile-next` as `cb201550`, no conflicts.

## Live versus unfinished
Live: everything in the #652 report, plus the expanded player. Ready for the owner's word: the cover access test
(#653), and reports #647, #648, #649, #654, #655; #645 waits for its wording fix. Next for the player: folder covers
as cover art and clearer buttons (OPTION-27 sends plans first). Open for the owner: privacy and terms lines for the
14-day switch-off and the 6-year record.
