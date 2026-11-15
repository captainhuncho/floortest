# 15 Nov 2026: One Collections menu (#554)
Owner's word in the desk session: "ship it #554", after testing it on the test link ("collections works"). The PR was
merged directly (`lane:standard`), so this report follows on its own branch, with the full checks run on a tree
identical to what went live.

## Build
- #554: head `9a81454e` (Build, `build/one-collections-menu`), off `main` `4a221c40`. Merged as `024dea01` (parents
  `9f9117c3` and `9a81454e`). Production deploy 7810893151 success.
- Checks ran on `2e2885e5` (`main` `9f9117c3` merged with `9a81454e`), whose tree equals `024dea01`'s (no diff).
- Test link: `mobile-next` `ed8c495a` held #554 from the owner's "try it"; the owner tested it there.
- Previous release: #559 (report only), merge `9f9117c3`, production deploy 7810734605 success.

## What shipped
- Projects leaves the sidebar and the phone tab bar. Collections opens with a Callouts / Projects switch, and
  Collections stays lit on both pages. Page addresses are unchanged. The projects page keeps its own access check.
- Docs: `docs/product/receiver.md`.
- 6 files, 34 lines added and 4 removed. No migration, no package change.

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck | `2e2885e5` | passed |
| Lint | `2e2885e5` | passed (0 errors) |
| Unit tests | `2e2885e5` | passed (925/925) |
| check:perms | `2e2885e5` | passed |
| npm audit --omit=dev | `2e2885e5` | passed (0 vulnerabilities) |
| e2e (full) | `2e2885e5` | passed (111 passed, 1 skipped, 0 failed) |
| CI (checks, CodeQL, dependency-review) | `9a81454e` | passed |
| Safety review | `9a81454e` | passed (nav and tab row only; no auth, data or route change; tap targets 44 px on phones) |
| Owner test on the test link | `ed8c495a` | passed |
| Safety ship verification | `024dea01` | passed (tree equals merge-tree; live health 200, headers in place) |

## Status
- Live: one Collections menu with the Callouts / Projects switch.
- Unfinished: nothing in this change.

## Rollback
- Last good before #554: production 7810734605 (`main` `9f9117c3`). No migration, so rolling back is safe.

## Next
#555 and #560 (deleted accounts) on the test link once Safety verifies Backend's merge with `main`.
