# 17 Nov 2026: Erasing someone by email clears them from share links (#592)
A privacy bug fix (`lane:owner`). Nothing changes on screen, so no try on the test link. It merges only on the owner's
"ship it" for this PR in the desk session. #591 (Analytics) ships with or after it, never before.

## Build
- Release branch `release/592` off `main` `4f092890`, merging #592 (Backend, head `878350d3`). Clean merge: `18164dbe`.
  - `95d8f56c`: erasing a person by email also clears that email from share links.
  - `878350d3`: the email match ignores letter case, and an empty address is refused.
- 4 files against `main`: `src/lib/privacy.ts`, `src/lib/share-links.ts`, `tests/erase-link-email.test.ts` (new) and
  `docs/05-data.md`. 100 lines added and 4 removed, plus this report.
- Migrations: none. Packages: none added or changed.
- Previous release: #593 (Next.js 16.4.6), merge `4f092890`, production deploy 7838651302, report
  `2026-11-16-release-590-next-16-4-6.md`.

## What shipped
- When the team erases a person by email (privacy request), that email is now removed from share links too, not just
  from the main records. Before this, the address could stay on a share link after the erase.
- The match ignores letter case, so `Name@Example.com` and `name@example.com` are the same person.
- An empty email is refused, so an erase can never match every link.

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck | `18164dbe` | passed |
| Lint | `18164dbe` | passed (0 errors) |
| Unit tests | `18164dbe` | passed (958/958) |
| check:perms | `18164dbe` | passed (86 tables with row-level security) |
| npm audit --omit=dev | `18164dbe` | passed (0 vulnerabilities) |
| e2e (full) | `18164dbe` | 115 passed, 1 skipped, 1 failed: `two-account-actions.spec.ts:158` (desk switch banner not shown in time) |
| e2e, the failed spec alone, 3 repeats | `18164dbe` | passed (12/12) |
| Safety review (two blind reviewers) | `878350d3` | passed |
| CI on #592 | `878350d3` | passed |
| CI | release PR | see PR checks |

The one full-run failure is in desk switching, which this release does not touch; the same test passed on `main` plus
#583 (`dd4c4c52`) in the run before, and 12 times in a row here. Two earlier e2e attempts on this branch did not start
the test server (a set-up fault in the desk's scratch copy, not a test result) and are not counted.

`18164dbe` is this branch before this report was added.

## Status
- Built and tested: everything above.
- Live: not yet; goes live when this PR merges.

## Rollback
- Last good deployment: production 7838651302 (`main` `4f092890`), or the #589 deploy if that ships first. No migration,
  so rolling back is safe.
