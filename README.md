# FloorTest

The receiving desk for new music: exclusives and works in progress for DJs to test on the floor, released tracks too. A receiver (DJ, curator, label, radio) shares one permanent link; senders upload original WAV or MP3 files to it; the receiver listens, keeps or passes, and downloads what they'll play, ready for Rekordbox; the sender follows a private receipt that says what actually happened. Solo, or as a team on one desk.

Live at https://floortest.app (private beta, invite only).

## Start here

This README only gets you running. What the product does, how it's built and what's next live in six docs that are kept current with the code (a change that alters any of them updates them in the same commit; see `AGENTS.md`):

| Doc | What's in it |
| --- | --- |
| [docs/01-product.md](docs/01-product.md) | Every feature, screen by screen: receiving, review, collections, Prepare for set, contacts, teams, plans, the sender's side, ops |
| [docs/02-technical.md](docs/02-technical.md) | Stack, services, routes, the app API, switches |
| [docs/03-app-flow.md](docs/03-app-flow.md) | What happens on each click |
| [docs/04-design.md](docs/04-design.md) | Colours, type, buttons, layout, brand assets |
| [docs/05-data.md](docs/05-data.md) | Every table, who can see what, retention |
| [docs/06-plan.md](docs/06-plan.md) | The one to-do list, in order, and what's done |

Also: [docs/operations.md](docs/operations.md) (running it: settings, releases, jobs, backups, deletion, incidents), [SECURITY.md](SECURITY.md), [docs/CODE_STYLE.md](docs/CODE_STYLE.md), [docs/DATABASE.md](docs/DATABASE.md), [docs/API_GUIDE.md](docs/API_GUIDE.md), [docs/brand-voice.md](docs/brand-voice.md) (the words we use), [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md) (product and design context), [docs/retired.md](docs/retired.md) (features that were replaced).

## Run it locally

```bash
npm install
npm run seed    # demo desk with callouts and tracks (wipes ./data)
npm run dev
```

Open http://localhost:3000. Demo login: `demo@floortest.test` / `floortest-demo` (local only); the demo link is `/maxwell`.

No services to install: locally the app runs on embedded Postgres (PGlite) and a folder for files, both under `./data`, and emails are logged instead of sent. Stop the dev server before `npm run seed` or any script that opens `./data` (the embedded database is single-process); for experiments use a scratch `DATA_DIR`. Node 22.5+.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js (`build` first checks every ops page and action names its permission) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (`tests/`) |
| `npm run check:perms` | Every ops action has a permission and every desk action has a role guard |
| `npm run e2e` | Playwright end-to-end tests (`e2e/`; seeds its own throwaway data; port 3000 must be free) |
| `npm run seed` | Local demo data (refuses to run against a real database or bucket) |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` (Vercel runs this on every production build) |
| `npm run smoke -- <url> <handle>` | Sends a real test track through a deployment's public link |

Before shipping: `typecheck`, `lint`, `test`, `check:perms`, and `e2e` when a change touches sending, review, downloads or auth. Other scripts (restore drill, bucket copy, stress test) are listed in [docs/operations.md](docs/operations.md#test-scripts).

## How it fits together

| Piece | Local | Production |
| --- | --- | --- |
| App | Next.js dev server | Vercel, London (`lhr1`); `main` deploys production, `mobile-next` is the working branch |
| Database | PGlite in `./data` | Neon Postgres (London) via `DATABASE_URL`; migrations in `src/lib/db/migrations.ts` |
| Files | `./data/storage` | Cloudflare R2, private bucket `floortest-audio-eu` (Western Europe); previews use `floortest-audio-preview` |
| Email | Logged | Resend, from `team@floortest.app` |
| Errors | Console | Sentry (through `/api/monitoring`) |
| Jobs | Call the cron URLs by hand | Vercel Cron (`vercel.json`) |
| Apps | `mobile/` | Capacitor 8 shells for iPhone and Android that load the website, plus native share, background playback and offline kept tracks |

Uploads never pass through the app server: the browser asks for permission (every intake rule runs there), PUTs the file straight to storage with a signed link, then asks the server to check it really is WAV/MP3 before the track exists. Playback redirects to short-lived signed links; downloads stream through the app so "Downloaded" is recorded only when the file actually finished. Share links and team invites are stored only as fingerprints, and every file deletion goes through a queue that retries until storage confirms. Details: [docs/02-technical.md](docs/02-technical.md) and [SECURITY.md](SECURITY.md).

## Deploying

Production runs on Vercel with the services above; settings are Vercel environment variables (names in [docs/operations.md](docs/operations.md#settings-vercel-environment-variables) and `.env.example`; values never go in the repo or chat). Shipping is: merge `mobile-next` into `main`, push, confirm the deployment is live. To run your own copy elsewhere, `npm run build && npm start` works on any Node host: point `DATABASE_URL` at Postgres and the `S3_*` settings at any S3-compatible bucket (or put `DATA_DIR` on a persistent volume), and call the cron URLs from a scheduler.
