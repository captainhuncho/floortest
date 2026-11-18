# Release: #658, erase by email also clears share-link limits (18 Nov 2026)

Erasing a sender's email address (#592) now also clears that address's share-link code and request-limit rows, with
tests that the block on the address still refuses, domain and account recipients survive, and `linkDataFor` comes back
empty. Nothing on screen changes. Added to `main`: 3 files, +47 −3 (`git diff bbf100cb e813c228`). lane:standard
(Safety: deletes only throttle rows keyed by the erased address inside the erase the owner approved in #592; they
expire within 2 days anyway). Merged by the owner on GitHub at 21:29:47Z, after Safety cleared it; the owner's
"ship it #658" in the Desk followed.

| Item | Value |
|---|---|
| PR | #658 |
| Head | `892c35bf` |
| Merge commit | `e813c228` |
| Production deploy | 7896794684, success (then 7896806681 for `8cd3c0e6`, #434, also success) |
| Rollback target | deploy 7896789082 (`bbf100cb`, #659) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `892c35bf` | passed (6/6) |
| Safety review | `892c35bf` | cleared, lane:standard |
| e2e | | not run: no screen, route or auth change |
| Health `/api/health`, `/`, `/login`, `/signup` | production (`8cd3c0e6`) | 200, 200, 200, 200 |

## Other releases since the last code report (#600)
Merged by the owner on GitHub, evidence, tests or mockups only, no behaviour change:
- 21:18–21:20Z: #655, #654, #657, #653 (test only), #649, #648, #647, #645.
- #659 (corrections to the #642 and #600 reports): merge `bbf100cb`, deploy 7896789082.
- #434 (desktop and Dock mockups in `mockups/desktop-dock/`, not served): merge `8cd3c0e6`, deploy 7896806681.

## After the merge
`main` merged into `mobile-next` as `d9da4145`, no conflicts.

## Live versus unfinished
Live: everything in the #600 report, plus the erase change. Being built: folder covers in the players (callout cover,
owner's picks), then the clearer-buttons audit for the players and top bar. Open for the owner: privacy and terms
lines for the 14-day switch-off and the 6-year record.
