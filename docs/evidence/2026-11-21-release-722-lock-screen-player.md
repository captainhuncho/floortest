# Release: #722, iPhone lock-screen player with buttons and cover art (21 Nov 2026)

The phone app shows the playing track's cover, title and artist on the lock screen and answers its play, pause and
next buttons. 10 files, +209 −26, no migrations. Standard lane: on the test link since the owner's "try it #722"; the
owner said "ship it #722" in the Desk after the simulator check.

| Item | Value |
|---|---|
| PR | #722 |
| Head | `1e9077de` |
| Merge commit | `dcbae736` |
| Production deploy | `dpl_3aCxbnh7xRDR2545hVL23TECsVdF`, ready |
| Rollback target | `dpl_H6fgBCnCEWXtDcjUzCWchsSizEuc` (`0a1d5ebf`, #727 report), the last live deploy |

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks (runs `audit:prod`), Analyze, CodeQL, dependency-review, Vercel | `1e9077de` | all green before the merge; GitHub CLEAN, not a draft |
| Typecheck, lint, `check:perms`, `audit:prod` (BUILD) | `1e9077de` | passed |
| Unit | `1e9077de` | 1091 passed, 0 failed |
| e2e | `1e9077de` | 134 passed, 1 skipped (the deliberate one), 0 failed: the full run had one dev-mode flake in `two-account-actions.spec.ts:172` (reference numbering only) and one test not run; both passed on a solo rerun of that spec, 4/4 |
| Safety review, Popo blind review | `1e9077de` | cleared; Popo PASS |
| Simulator check (iPhone 17, native and web both from mobile-next) | `1e9077de` | cover, title, artist show; play, pause and next reach the app; audio plays |
| Health `/api/health`, `/`, `/login`, `/signup` | production | 200, 200, 200, 200 |

Older app builds without the native plugin are safe: the web code finds no plugin and does nothing.

## Other releases since the last code report
- #727, report for #726: merge `0a1d5ebf`, deploy `dpl_H6fgBCnCEWXtDcjUzCWchsSizEuc`.

## After the merge
`main` merged into `mobile-next` as `9fef722b` (same tree as `64d75814`, which already carried #722); preview
`dpl_NHk4Zmqz9xeWZfJqhMS99H5Fi6RV`, and the test link points at it. A release build of `64d75814` (which contains #722's
native code) is installed on the owner's iPhone 13; it loads floortest.app.

## Live versus unfinished
Live: as in the #726 report, plus the lock-screen player. Unfinished: the lock-screen time shows "--:--" (WebKit's own
media entry competes with the plugin; board #88); previous, seek, Control Centre and headphone buttons were not checked
on the simulator and wait on the owner's phone check; BUILD's two hardening fixes come in a follow-up PR; the Apple team
ID is not yet in the committed iOS project (board #89).
