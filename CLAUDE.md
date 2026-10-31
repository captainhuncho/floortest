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
| Money: the finance panel, rhythm, decisions; costs; what a subscriber is worth | `docs/finance.md`, `docs/costs.md`, `docs/revenue-model.md` |
| What happens on each click | `docs/03-app-flow.md` |
| Colours, type, layout, components | `DESIGN.md`, `docs/04-design.md` |
| Tables, who can see what, retention | `docs/05-data.md`, `docs/DATABASE.md` |
| What's next, what's done, open team decisions | `docs/06-plan.md` |
| Users, principles, launch decisions | `PRODUCT.md` |
| Words and tone | `docs/brand-voice.md` (no exclamation marks, no square brackets, "track", Keep / Not for me) |
| Rollout, copy, images, motion | `docs/rollout/` |
| Runbooks, incidents | `docs/operations.md` |
| How the work runs: sessions, branches, checks, the owner's list, the twelve working principles | `docs/working.md` |
| What each release was checked against (one report per ship) | `docs/evidence/` |
| The 15 standard docs (short index, owner's rule 18 Oct; keep in step with the docs they link to) | `docs/1. PRD.md` … `docs/15. Debugging.md` |
| Codebase map (graphify, 20 Oct: every module, route and doc as a graph; refresh with `graphify update .`) | `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html` |

`docs/archive/` is history only.

## Docs rule
Any change to a feature, tool, route, screen rule, table/permission or the plan updates the matching doc in the same
commit. Shipping an item from `06-plan.md` moves it to Done.

## Branches, preview and production
- Work on `mobile-next`. Pushing it builds a Vercel **preview** (its own database, the `floortest-audio-preview` bucket,
  no email key): safe to show the owner. `main` is **production**: only on the owner's "ship it" (merge the release PR
  into `main` on GitHub, never push `main`; wait ~60 s, merge `main` into `mobile-next` and push `mobile-next`; confirm
  the deploy; steps in the `owner-ship` skill).
- `vercel-build` runs migrations: a new migration reaches production only when shipped.

## Every session, every task (owner, 15 Oct; full text: `docs/working.md` rules 1–15)
Three sessions share this repo (owner, 29 Oct): Desk, Build and Safety. Only the Desk merges into `main`, writes the
release report and merges `main` into `mobile-next`; Build and Safety work on their own branches off `main` (never the
shared checkout), may put work on `mobile-next` for the owner to try, and send the Desk "ready: PR, head commit, checks
passed". Never open a PR from `mobile-next` into `main`. Never delete branches unless the owner asks. Every PR carries a
release lane label (owner, 31 Oct; `docs/working.md` rule 13): `lane:standard` (release branch, full checks, report in
the release PR), `lane:fast` (look-only; the Desk merges the PR directly once its exact head passed every check incl.
e2e; one evening report) or `lane:urgent` (security, data loss, site down; any time). The Desk merges all of them, only
on the owner's word in the Desk. Follow the
owner's twelve working principles (rule 12): understand first, preserve what works, finish whole journeys, keep it simple,
measure before claiming speed, verify real behaviour, name the exact build in every report. Optimise: find out before
asking, batch questions, exact-string edits, no merge markers, outcome first in reports. Rule 14 lists the owner's skill
areas (design, audits, deployment and recovery, performance, email, writing, motion, research, browser and device checks,
documents, infrastructure) and the installed skill for each: load it before that kind of work. Rule 15 is "No AI Slop":
useful thing first, everyday words, specific facts, no clichés or invented certainty; no oversized headings, card piles,
pills, random gradients or coloured shadows; every visible button works; a polished preview isn't working software.
Final check: specific to this product, easy to understand, actually works, what can go. New work runs in cloud
sessions; this Mac is for browser and device checks.

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
