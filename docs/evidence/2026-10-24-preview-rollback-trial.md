# Rollback trial on Preview (24 Oct 2026)

Plan B7 item 5: try one rollback and record it, before the beta. Done on Preview only; production untouched.

## What was tried
Preview's branch address (`floortest-git-mobile-next-…vercel.app`) was pointed back from the current build to an older one, checked, then pointed forward again. The older build was chosen so its code runs against a newer database, the realistic case after a bad release:

| | Build | Commit | Database |
|---|---|---|---|
| Before | `dpl_Ayj4fwaZj4tG2EUzA2ndmMhG2A9b` | `65c8aa2` (R2 timeouts) | migrated through `0102` |
| Rolled back to | `dpl_7EbMSLfyUwK1x1mhC9eU4ZLjrKsG` | `fd0a329` (file fingerprints, before the email queue) | still `0102`: migrations don't roll back |

## Timings (UTC)
| Step | Time | Result |
|---|---|---|
| Point the address at the older build | 19:43:54 → 19:43:57 (3 s) | Vercel confirmed the move from `dpl_Ayj4…` |
| Check | 19:44:15–19:44:19 | `/api/health` `{"ok":true,"checks":{"database":"ok"}}`; `/login` 200, page reports `data-dpl-id="dpl_7EbMSLfyUwK1x1mhC9eU4ZLjrKsG"`, framing headers present |
| Point it forward again | 19:44:35 → 19:44:37 (2 s) | Vercel confirmed the move back from `dpl_7EbM…` |
| Check | 19:44:45 | `/api/health` ok; the address is listed on `dpl_Ayj4…` again |

## What it shows
- Switching builds takes seconds and needs no rebuild.
- Older code runs on a newer database: migrations here are additive only (new tables, columns, indexes, `NOT VALID` rules), so code that doesn't know about them is unaffected. Keep migrations additive; a migration that drops or renames something would break this.
- After a real rollback, check what the newer version had started, for example emails it queued in `outbox` but hadn't sent (`status = 'queued'`), which older code doesn't send (noted in each release report).

## How to do it on production
Vercel → Deployments → the last good production deployment → Promote (Instant Rollback). Each release report in `docs/evidence/` names the deployment to promote. Then check `/api/health` and a page, and add a note to the release report.

## Side effect
Fetching the protected Preview with Vercel's tool created a temporary share link on the Preview branch address (Vercel-managed, expires about 23 hours after 19:43 UTC on 24 Oct). Preview holds test data only.

## Process note
Writing this report, a worktree path that already existed made the setup step fail; the plan line (`f2e2063`) was then committed from the shared checkout instead of a worktree. It contained only that one line, the checkout was clean and on `mobile-next`, and this report was added separately afterwards. Worktree setup now stops if the path exists.
