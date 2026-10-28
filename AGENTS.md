# Working on FloorTest

The receiving desk for new music: DJs, curators and labels get one link; senders upload without an account and get an
honest receipt. Next.js 16 (App Router, not the Next.js you know: read `node_modules/next/dist/docs/` before writing
framework code), React 19, Tailwind 4, Postgres (Neon in production, PGlite under `./data` locally), Cloudflare R2.

## Read on demand, not up front
Open only what the task touches. The docs stay true; if a doc and the code disagree, the code wins and you fix the doc.

| For | Read |
|---|---|
| What a feature does, screen by screen | `docs/01-product.md` |
| Stack, services, env, deploys | `docs/02-technical.md`, `docs/services.md` |
| What happens on each click | `docs/03-app-flow.md` |
| Colours, type, layout, components | `DESIGN.md`, `docs/04-design.md` |
| Tables, who can see what, retention | `docs/05-data.md`, `docs/DATABASE.md` |
| What's next, what's done, open team decisions | `docs/06-plan.md` |
| Users, principles, launch decisions | `PRODUCT.md` |
| Words and tone | `docs/brand-voice.md` (no exclamation marks, no square brackets, "track", Keep / Not for me) |
| Rollout, copy, images, motion | `docs/rollout/` |
| Runbooks, incidents | `docs/operations.md` |
| The 15 standard docs (short index, owner's rule 18 Oct; keep in step with the docs they link to) | `docs/1. PRD.md` … `docs/15. Debugging.md` |
| Codebase map (graphify, 20 Oct: every module, route and doc as a graph; refresh with `graphify update .`) | `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html` |

`docs/archive/` is history only.

## Docs rule
Any change to a feature, tool, route, screen rule, table/permission or the plan updates the matching doc in the same
commit. Shipping an item from `06-plan.md` moves it to Done.

## Branches, preview and production
- Work on `mobile-next`. Pushing it builds a Vercel **preview** (its own database, the `floortest-audio-preview` bucket,
  no email key): safe to show the owner. `main` is **production**: only on the owner's "ship it" (merge into `main`,
  push `main`, wait ~60 s, then push `mobile-next`; confirm the deploy).
- `vercel-build` runs migrations: a new migration reaches production only when shipped.

## Checks
`npm run typecheck`, `npm run lint` (0 errors), `npm test`, `npm run check:perms` before every push; `npm run e2e` when a
change touches sending, review, downloads, receipts or auth (port 3000 must be free).

## Local data
Never run scripts against `./data` while the dev server runs (PGlite is single-process), and don't change `./data` for
experiments: copy it to a scratch folder and set `DATA_DIR` (a `.claude/launch.json` entry can pass it as `env`).
Scripts that send mail need an `APP_SECRET`; use a throwaway value locally.

## Never
Secrets in the repo or chat; editing the legal pages (lawyer wording); installing third-party hooks or plugins;
deleting buckets, databases or accounts (the owner does that); changing production settings without being asked.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
