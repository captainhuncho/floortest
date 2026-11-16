# 16 Nov 2026: Send rules by receiver type (#553, with #557)
Owner's words: "try it #553" in the desk session; "Sentence OK" for the consent sentence (typed in the backend session;
wording only); then "label send works" in the desk session after testing on the test link. `lane:standard`; the merge
runs on the owner's "ship it" for this PR.

## Build
- Release branch `release/send-rules-553` off `main` `24e97165`, merging `e875253b` (#553, Backend,
  `backend/send-rules`), which holds #557 `c083c7b9` and `main` `d03baedc`. Merge commit `8ee07f69`, no conflicts,
  plus this report.
- Safety cleared #553 (`979f8582`) and #557 (`c083c7b9`), then `e875253b`: it equals the clean merge of the cleared
  heads with `d03baedc`, apart from `scripts/seed.ts`, where the resolution only adds test accounts (`notices@` from
  #551 and `label-sender@`).
- Test link: `mobile-next` held `979f8582`, then `c083c7b9` from `a77d3fa8`. The owner tested the label send there.
- Migrations: none. Packages: none added or changed.
- Previous releases: #569 (#562 + #568, Terms required everywhere), merge `24e97165`, production deploy 7812564820
  success, report `2026-11-16-release-terms-required-8f1390cd.md`.

## What shipped
- Senders choose how a track may be heard only when the receiver is a label or an A&R desk: "Evaluation only" or "OK
  to play". Every other receiver gets DJ-style sends, with no choice to make. One helper, `receiverAsksPlayChoice`,
  decides it on the server.
- The link page tells the send form the receiver type; the signed-in Send page asks the same play choice for labels.
- The per-send DJ sets switch is gone.
- e2e covers label sends.
- 19 files against `main`, 183 lines added and 23 removed, plus this report.

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck | `8ee07f69` | passed |
| Lint | `8ee07f69` | passed (0 errors) |
| Unit tests | `8ee07f69` | passed (951/951) |
| check:perms | `8ee07f69` | passed |
| npm audit --omit=dev | `8ee07f69` | passed (0 vulnerabilities) |
| e2e (full, with #569's Terms gate) | `8ee07f69` | passed (113 passed, 1 skipped, 0 failed) |
| e2e (full), Backend | `e875253b` | passed (113 passed, 1 skipped, 0 failed) |
| Safety review | `979f8582`, `c083c7b9`, `e875253b` | passed |
| Owner: consent sentence | wording | OK ("Sentence OK") |
| Owner test on the test link: label send | `a77d3fa8` and later | passed |
| CI | release PR | see PR checks |

## Status
- Built and tested: everything above.
- Live: not yet; goes live when this PR merges.
- Unfinished: nothing in this change. #566 (removes the now-unused `SetsPermission.tsx`) follows, retargeted to `main`.

## Rollback
- Last good deployment: production 7812564820 (`main` `24e97165`). No migration, so rolling back is safe.

## Next
#566 after this release.
