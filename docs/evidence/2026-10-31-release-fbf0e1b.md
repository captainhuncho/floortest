# 31 Oct 2026: Google sign-up page fixed (#220), and typed details survive on the owner's upload (#221)

Owner's words in the desk session: "ship #220 and #221".

## Build
- Release branch head (checked): `fbf0e1b` = `main` `0b1d11a` + #220 + #221.
- Contains:
  - #220 `safety-google-signup-frame` at `7005638` (Safety), `lane:standard`.
  - #221 `owner-upload-tags` at `29eae9d` (Build), `lane:standard`.
- Previous releases (merged on the owner's "ship #216, #218, #213 and #215"):
  - #219 (#216 + #218, report `2026-10-31-release-7f346a7.md`), merge `8044a21`, deployment
    `dpl_3qe79qu8Qby6o7aVSwadQEitW3VY`. #217 was carried inside #218; GitHub marked it merged.
  - #213 (lane:fast, docs), merge `5f2b706`, deployment `dpl_52BaHPU6fkXortPN4XYaAuwXkAPA`.
  - #215 (lane:fast, docs), merge `0b1d11a`, deployment `dpl_AF9Bvj53Z2xKcMxodqCURf7ST7R1`. No migrations.
- This release's merge commit and production deployment go in the next release's report.

## What shipped
- #220, a live bug from #218: `src/app/(auth)/signup/google/page.tsx` wrapped the invite-only note and the consent label
  in `<AuthFrame>`, so a whole sign-up frame (header included) rendered inside a `<p>` and a label: invalid HTML and a
  broken-looking Google sign-up page. Both go back to plain fragments. Consent wording unchanged. Found by Safety's
  review of #218, which found no security problems (fixed `/signup/ready` target through `safeNext`, Turnstile kept, no
  password in `sessionStorage`, `/signup/ready` signed-in only and shows only the person's own data).
- #221, the follow-up to #216: `src/app/dashboard/collections/OwnerUpload.tsx` now uses `fillFromFile`, so a late read of
  the file's own tags fills only fields the owner has not touched. One unit test added in `tests/tags.test.ts`.
- No schema, route or migration changes.

## Checks
On `fbf0e1b` locally after `npm ci`, e2e on ports 3310/3311. Both started when the "ready" messages arrived.

| Check | `fbf0e1b` (#220 + #221) | `7005638` (#220 alone) |
|---|---|---|
| `npm run typecheck` | passed | passed |
| `npm run lint` | passed (0 errors; 2 old warnings) | passed |
| `npm test` | passed (344/344) | first run 1 failure under heavy load (timeout), rerun passed |
| `npm run check:perms` | passed | passed |
| `npm audit --omit=dev` | passed (0 vulnerabilities) | passed (0) |
| `npm run e2e` | passed (52/52 in 14.1 min, machine under load) | first run stopped under heavy load; covered by the combined run |
| Senders' own runs | #220: 343/343, e2e 52/52; #221: 344/344, e2e 52/52 on 3290/3291 | |

## Rollback
Last good deployment: `dpl_AF9Bvj53Z2xKcMxodqCURf7ST7R1` (`0b1d11a`). No migrations; an Instant Rollback is safe.
