# Release: #676, Tap-speed limits in one insert and one count (19 Nov 2026)

Server only, nothing on screen: the tap-speed route checks its rate limits with one insert and one count
(`allowAll` in `src/lib/ratelimit.ts`) instead of two queries per limit, with the same outcome and the same race
safety. `allowAll` is new and used only by `src/app/api/tap-speed/route.ts`; existing limits and `claim`/`allow` are
unchanged, and every value is a bound parameter. 3 files, +62 −4. No migration. lane:standard. Shipped on the owner's
"ship it #676" in the Desk; no owner try was possible because nothing on screen changes.

| Item | Value |
|---|---|
| PR | #676 |
| Head | `8e1bcd82` |
| Merge commit | `6bb052d8` |
| Production deploy | 7911943595, success |
| Rollback target | deploy 7911347562 (`f8b24141`, #672) |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel, Vercel Preview Comments | `8e1bcd82` | passed (6/6) |
| Typecheck, lint (0 errors), check:perms, `audit:prod` (Backend) | `8e1bcd82` | all passed |
| Tests: `tap-speed-cap`, tokens | `8e1bcd82` | 4 passed, 0 failed |
| e2e | | not required: no change to sending, review screens, downloads, receipts or auth |
| Merge with `main` | `f8b24141` | GitHub CLEAN |
| Safety review | `8e1bcd82` | cleared |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

## Other releases since the last code report
- #672, reports for #663 and #662: merge `f8b24141`, deploy 7911347562.

## After the merge
`main` merged into `mobile-next` as `1e089ebf`, no conflicts.

## Live versus unfinished
Live: the player covers (#663), the new Send music page (#662) and this change. Held: Change cover for projects and
folders (#669), main merged in as `1829664f`, its e2e (folders, collection panel, batch) first in the queue. Next: the
volume reveal (`e4c57410`, local), then the six clearer player buttons. Drafts, not yet sent for review: Activity
(#670), Referrals (#673), Plans and checkout (#674), Projects (#675), How it works (#677), Played out (#678), Contacts
(#679).
