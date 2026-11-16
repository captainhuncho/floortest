# 16 Nov 2026: Terms required everywhere (#562, #568)
Owner's word in the desk session: "try it #562", then "Terms test passed on the test link". One release PR carries
both (`lane:owner`: sign-in and access), so the merge runs on the owner's "ship it" for this PR.

## Build
- Release branch `release/terms-required-562-568` off `main` `6341e58e`, merging `9d20133a` (#568, Backend, Safety's
  four low follow-ups), which holds #562 `c0dae125` (Backend, `backend/terms-required`). Merge commit `8f1390cd`, no
  conflicts, plus this report.
- Safety: #562 `6c587266` passed a double blind review; `cdbc374a..c0dae125` (the owner's 1a and 2a, Safety's fixes 1-5,
  Sign out) passed a second double blind review with two fresh reviewers; #568 `9d20133a` cleared. Safety verified
  `8f1390cd`: its tree equals the clean merge of `6341e58e` and `9d20133a`, and it adds only the five cleared commits.
- Owner decisions (15 Nov): "the tick is required, don't let anyone in without agreeing to terms"; 1a (admins tick on
  their own desk; the ops console isn't gated); 2a (delete and export work without the tick); "Yes, re-ask everyone"
  when the sharing switch changes.
- Test link: `mobile-next` `533eafdc` (then `b2cb085a`, `a77d3fa8`, `deff0599`) held `c0dae125`. The owner tested it
  there.
- Migrations: none. Packages: none added or changed.
- Previous releases, not yet recorded in a report of their own: #567 (report for #564 and #565), merge `6341e58e`,
  production deploy 7812230025 success. #564 and #565's report is `2026-11-16-release-564-565-d03baedc.md`.

## What shipped
- Nobody uses FloorTest without agreeing to the current Terms. The desk, every page and action that needs a signed-in
  person, and every `/api/v1` route except `auth/*` and `terms` send the person to the Terms page (or answer 403
  `termsNeeded`) until they tick. If the Terms can't be read, the desk stays shut.
- From the Terms page a person can sign out, export their data, or delete their account (password step-up, then the
  14-day undo from #563) without ticking.
- An admin viewing a desk read-only is never asked. Admins tick on their own desk; the ops console isn't gated.
- New `/api/v1/terms` for app clients: GET the version, hash and link; POST the tick (rate limited, hash checked,
  stamped copy emailed as on the web).
- Docs: `SECURITY.md`, `docs/product/receiver.md`, API docs.
- 33 files against `main`, 478 lines added and 55 removed, plus this report.

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck | `8f1390cd` | passed |
| Lint | `8f1390cd` | passed (0 errors) |
| Unit tests | `8f1390cd` | passed (949/949) |
| check:perms | `8f1390cd` | passed |
| npm audit --omit=dev | `8f1390cd` | passed (0 vulnerabilities) |
| e2e (full) | `8f1390cd` | passed (111 passed, 1 skipped, 0 failed) |
| e2e (full), Backend | `c0dae125`, `9d20133a` | passed (111 passed, 1 skipped, 0 failed) |
| Safety double blind reviews | `6c587266`, `cdbc374a..c0dae125` | passed |
| Safety review | `9d20133a` | passed |
| Safety release verification | `8f1390cd` | passed |
| Owner test on the test link: Terms page blocks the desk, Sign out, Delete with password and 14-day path, tick opens the desk | `533eafdc` and later | passed |
| CI | release PR | see PR checks |

## Status
- Built and tested: everything above.
- Live: not yet; goes live when this PR merges.
- Unfinished: the stamped PDF email can't be checked on the preview (no email key there). Apps built before this
  release don't call `/api/v1/terms`; until updated they get 403 `termsNeeded` and the person ticks on the website.

## Rollback
- Last good deployment: production 7812230025 (`main` `6341e58e`). No migration, so rolling back is safe; acceptance
  records written meanwhile stay.

## Next
#553 (send rules, with #557) after the owner tests the label send and OKs the send sentence, then #566.
