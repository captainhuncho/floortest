# 30 Oct 2026 fourth release: legal pages match the product

Owner's words in the desk session: "You are the Desk. ship #150, let me know when live".

## Build
- Release branch head (checked): `c2c7ded`, from `main` `6ac21d2` (fast-forward: #150 was already on top of `main`).
- Contains: #150 `legal-notes` at `c2c7ded`.
- Previous release: #149, merge `6ac21d2`, deployment `dpl_EtXmsSSMTF2ePA7r5DBm5NDXP5WU` (#148; no migrations).
- This release's merge commit and production deployment go in the next release's report.

## What shipped
- The public legal and trust pages are corrected against the code: virus scanning named as live, retired colleague
  sharing removed, the cookie banner (Accept / Not now) and every cookie listed, internal lawyer and launch notes
  removed from the draft box, "(draft)" dropped from page titles. Last updated 30 October 2026.
- The owner's "Shared desks and collections" section is unchanged.
- Legal wording: the owner's call, given in the desk session. The lawyer's review is still open; every change is
  listed for them in `docs/legal-review.md`.
- No migrations.

## Checks
All on `c2c7ded`, locally, after `npm ci`.

| Check | Result |
|---|---|
| `npm run e2e` | passed (52/52 in 4.3 min) |
| `npm run typecheck` | passed |
| `npm run lint` | passed (0 errors; 2 warnings already on main) |
| `npm test` | passed (333/333) |
| `npm run check:perms` | passed |
| `npm audit --omit=dev` | passed (0 vulnerabilities) |
| Lawyer review of the new wording | open (owner item) |

## Rollback
Last good deployment: `dpl_EtXmsSSMTF2ePA7r5DBm5NDXP5WU` (`6ac21d2`). No migrations; an Instant Rollback is safe.
