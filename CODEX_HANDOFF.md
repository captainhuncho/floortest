# Codex handoff — 27 Sep 2026

This is a deliberately small compatibility and data-repair patch. It was made after a read-only comparison of the live beta, the Vercel project, and the earlier receiver prototype. A Vercel **Preview** deployment was created for testing; Production was not redeployed or changed.

## Changes

### 1. Old shared links no longer land on the 404 screen

`next.config.ts` now permanently redirects the pre-beta URLs to their current equivalents:

| Previous URL | Current destination |
| --- | --- |
| `/dj` | `/dashboard/floor` |
| `/sender` | `/sent` |
| `/mobile` | `/dashboard/floor` |
| `/activity` | `/dashboard/activity` |
| `/collections` | `/dashboard/collections` |
| `/operations` | `/admin` |

These are only aliases. The destination pages retain their existing authentication and admin checks.

### 2. Maxwell's public beta page data is repaired on the next migration run

Migration `0014_maxwell_public_page_repair` changes only exact placeholder values:

- Maxwell's role line: `MA?` → `DJ / Performer`
- Maxwell's collection: `MA?` → `Afterlife`

The migration is intentionally scoped to the `maxwell` handle and exact `MA?` values. It does not touch any other receiver or collection.

## Existing work preserved

There were already uncommitted Claude changes in the upload flow, account-to-account sending, review panel, sidebar, actions, core logic and migrations. Those edits were preserved. Migration `0014` was appended after Claude's `0013_account_sends`; nothing was reordered or rewritten.

## Verification

Completed by Codex:

- `npm run typecheck` — passed
- `TMPDIR=/private/tmp npm test` — 15/15 passed
- `npx next build --webpack` — passed, including route generation
- Production server redirect checks — all six aliases returned `308` to the destinations above
- Local `/maxwell` render — `DJ / Performer` present and `MA?` absent
- Vercel Preview deployment — built successfully and reached `READY`
- Preview landing page — rendered successfully in the browser

### Preview deployment

- Preview URL: `https://floortest-n6qu2kshh-maxwelladjavon-5776s-projects.vercel.app`
- Vercel deployment: `dpl_DB9hz4LYqdQZAyVea7N8Jdkc1Z2M`
- Target: Preview (not Production)
- Build duration: 36 seconds

The landing page works in Preview. Data-backed pages such as `/maxwell` currently fail there because the following secrets are scoped to Production only: `DATABASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `APP_SECRET`, `CRON_SECRET`, and `RESEND_API_KEY`. The observed `/maxwell` error is the SQLite fallback attempting to create `/var/task/data`, which is read-only in Vercel Functions.

Do not simply copy the Production secrets into Preview without deciding whether preview traffic is allowed to read and write real beta data. The safer next step is a separate preview database/storage environment; the faster but riskier option is to share Production services with Preview.

## Complete continuation brief for Claude

Read [CLAUDE_NEXT_WORK.md](CLAUDE_NEXT_WORK.md) before making further changes. It consolidates every remaining Preview, beta-operations, legal, copy, workflow, access-control, measurement and deferred-feature note, plus the Production deployment gate.

The default Turbopack build could not complete inside the Codex sandbox because Turbopack was denied permission to bind an internal process port. The supported Webpack production build completed successfully; this was an execution-environment limitation rather than a source error.

For a normal local or CI verification, run:

```bash
npm run typecheck
npm test
npm run build
```

After deployment, verify:

1. `/maxwell` shows `DJ / Performer` and `Afterlife` instead of `MA?`.
2. Each legacy URL above redirects to the expected page.
3. Signed-out visitors who open a private destination are still sent to `/login`.

## Not changed

- No production deployment was made; only the Preview deployment listed above exists.
- No Vercel settings, environment variables, Git connection or analytics settings were changed.
- No Supabase, R2 or Resend data was modified directly.
- The existing sender-account work remains uncommitted and should be reviewed as one separate feature.

## Sender notification decision — 2 Oct 2026

See [the sender notification decision in HANDOFF.md](HANDOFF.md#sender-notification-decision--2-oct-2026): send the submission confirmation/tracker-link email, then one listened email at the existing threshold (30 seconds or 25% of track duration, whichever is lower). Later sender-visible events belong in the tracker and, for account holders, in-app notifications, without further event emails. Kept remains private to the receiver across all sender surfaces. This reduces noise, makes the listened email meaningful, and materially reduces email costs at scale. Implementation is pending; this update changes notes only.
