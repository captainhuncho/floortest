# 16 Nov 2026: Members run callouts only when ticked (#583)
Owner's words: "Team members should be able to do call outs. Apart from admin and A&r, admin needs to tick for anyone
they want to be able to do call outs" (typed in the backend session; the owner confirmed there that existing Members lose
it until ticked). "try it #583" in the desk session. `lane:standard`; the merge runs on the owner's "ship it" for this PR.

## Build
- Release branch `release/583` off `main` `ef27c72e`, merging #583 (Backend, `backend/member-callouts`), head `29b27f18`.
  The release tree equals `29b27f18`. No conflicts.
- #583's heads, each cleared by Safety: `46e770f3` (merged `build/folders`), `d7e1f9a4` (main `ef27c72e` merged in),
  `68d31b01` ("New callout" in "+ New" for ticked Members; not cleared: Members saw a dead "Upload audio" on Projects),
  `417a42d3` (tests only), `8da3b450` (Projects fix), `29b27f18` (test only: the second browser in `teams.spec.ts` gets
  the usual test set-up).
- Migration: **0154 `member_callouts`, additive.** `account_members.callouts boolean not null default false`, plus
  `revoke update on account_members from ft_person` (it was already select-only), so nobody can tick themselves from
  the database. Packages: none added or changed.
- Previous release, recorded in its own report: #587 (folders, #578 + #586), merge `ef27c72e`, production deploy
  7828643270, report `2026-11-16-release-folders-578-586.md`.

## What shipped
- Desk owners and A&R / Admins run callouts by their role. A Member runs callouts only once an owner or admin ticks
  "Runs callouts" on their row in Settings → Team. **Every existing Member starts unticked.**
- A ticked Member can create a callout ("+ New" shows "New callout" only) and edit one (name, close date, track cap,
  brief, BPM, genres, sharing, artwork). Folders, Send-here, deleting and share links stay with owners and admins.
- An unticked Member sees no "+ New" on Callouts or Projects and no Edit; the server refuses them anyway and they land
  on Collections with a note saying who can tick them.
- Untick, removal or a role change applies on the next click. Ticks and unticks go in the admin log.
- 22 files against `main`, 438 lines added and 42 removed, plus this report.

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck | `499e3ee4` | passed |
| Lint | `499e3ee4` | passed (0 errors) |
| Unit tests | `499e3ee4` | passed (961/961) |
| check:perms | `499e3ee4` | passed (86 tables with row-level security) |
| npm audit --omit=dev | `499e3ee4` | passed (0 vulnerabilities) |
| e2e (full) | `499e3ee4` | passed (119 passed, 1 skipped, 0 failed) |
| e2e (full), earlier head | `eac12f79` | failed: `teams.spec.ts:173` stuck at the bot check (fixed in `29b27f18`) |
| Safety review | `46e770f3`, `d7e1f9a4`, `8da3b450`, `29b27f18` | passed |
| Owner test on the test link | `mobile-next` `d604ac33` | see the owner's word before ship |
| CI | release PR | see PR checks |

`499e3ee4` is this branch before this report was added.

## Status
- Built and tested: everything above.
- Live: not yet; goes live when this PR merges, and only after the owner has tried it on the test link.

## Rollback
- Last good deployment: production 7828643270 (`main` `ef27c72e`). Migration 0154 is additive and stays: old code ignores
  the column and every Member could already run callouts there, so rolling back the code is safe.

## Next
#588 (iOS share extension Done button) after the owner's try in the app.
