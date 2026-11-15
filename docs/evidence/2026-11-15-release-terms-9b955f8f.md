# 15 Nov 2026: Terms acceptance and Terms tick screens (#547, #548)
Owner's word in the desk session: "ship it #547 #548", after testing the Terms accept on the test link. One release PR
carries both (`lane:standard`, `docs/working.md` rule 13), so the merge runs on the owner's "ship it" for this PR.

## Build
- Release branch `release/terms-547-548` off `main` `f7c7c56b`, merging the checked head `13326cdb` (#548, Build,
  `build/terms-screens`), which holds #547 (Backend, `backend/terms-acceptance`) including the 0148 fix `3cc96e3b`.
  Merge commit `9b955f8f`, no conflicts, plus this report.
- Safety cleared #547 `3cc96e3b` and #548 `7b198f5e`, then verified `13326cdb` as the release head: its tree equals
  the clean merge of those two and nothing else.
- Test link: `mobile-next` `5193142d` (then `63f2f4aa`, `5b4f5835`) held these changes on the owner's "try it #547
  #548". The owner tested the Terms accept there.
- Migrations: 0147 (Terms acceptance records) and 0148 (reconcile, additive, for databases that ran an earlier 0147).
  Both add only; no data is dropped or rewritten.
- Packages: none added or changed. `package.json` changes only the `test` script (a test stub loader).
- Previous releases, not yet recorded:
  - #545 (release for #543, report `2026-11-15-release-34217df.md`): merge `cd04f187`, production deploy 7796601146
    success.
  - #546 (docs: product doc split, `lane:fast`): merge `2980293d`, deploy 7802127026 success.
  - #549 (docs: rollout research, `lane:fast`): merge `c65d34b8`, deploy 7802385158 success.
  - #550 (Terms wording (a), (b), (c) and the 15 November 2026 date, owner-approved legal edit): merge `4a221c40`,
    deploy 7807091625 success; live /terms showed the new text.
  - #551 (notices e2e fix, test-only, Safety cleared `888e8b9d`): merge `f7c7c56b`, deploy 7809462773 success,
    health ok. Safety verified `main` `f7c7c56b` holds #551 only.

## What shipped
- Signed-in people accept the current Terms once: the desk shows an accept screen until their latest acceptance
  matches the hash of the Terms text. Each person accepts for themselves; an admin viewing a desk with "View as" is
  not asked and cannot accept.
- Every acceptance is recorded (person, version, hash, time), and a stamped PDF copy of the Terms is emailed.
- Sign-up shows the Terms tick. Senders without an account see the tick on their first send, not again.
- Folder sends show the Terms tick only when it is needed.
- Migrations 0147 and 0148; docs (`SECURITY.md`, data, plan, product, Testing & QA) updated with the code.
- 44 files against `main`, 1,549 lines added and 38 removed, plus this report.

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck | `9b955f8f` | passed |
| Lint | `9b955f8f` | passed (0 errors, 3 warnings) |
| Unit tests | `9b955f8f` | passed (925/925) |
| check:perms | `9b955f8f` | passed |
| npm audit --omit=dev | `9b955f8f` | passed (0 vulnerabilities) |
| e2e (full) | `9b955f8f` | passed (111 passed, 1 skipped, 0 failed) |
| e2e (full), earlier | `13326cdb` | 110 passed, 1 skipped, 1 failed (the notices flake, fixed by #551) |
| Owner test on the test link | `5193142d` | passed: the owner tested the Terms accept |
| Safety review | `13326cdb` | passed |
| CI | release PR | see PR checks |

## Status
- Built and tested: everything above.
- Live: not yet; goes live when this PR merges.
- Unfinished: the stamped PDF email can't be checked on the preview (no email key there). The Privacy Policy line on
  how long acceptance records are kept is owed by the owner or lawyer (legal wording).

## Rollback
- Last good deployment: production 7809462773 (`main` `f7c7c56b`).
- Rolling back restores code, not data. 0147 and 0148 only add tables and columns, so the old code still runs on the
  new schema.

## Next
#553 (send rules by receiver type) after the owner checks the send sentence on the test link.
