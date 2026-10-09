# Working on FloorTest

Read these first. They describe what is live, and they stay true:

1. `docs/01-product.md` — what it does, feature by feature
2. `docs/02-technical.md` — what it's built on
3. `docs/03-app-flow.md` — what happens on each click
4. `docs/04-design.md` — colours, fonts, buttons, layout
5. `docs/05-data.md` — where data lives, who can see it
6. `docs/06-plan.md` — the one to-do list, in order

## Docs rule
Any change that alters a feature, tool, route, screen rule, table/permission, or the plan **updates the matching doc in the same commit**. Shipping an item from `06-plan.md` moves it to Done. If a doc and the code disagree, the code wins; fix the doc.

## Basics
- Work on `mobile-next`; `main` deploys production. Ship = merge into `main`, push, confirm the deploy is live.
- Never put secrets in the repo or chat. Never run scripts against `./data` while the dev server runs; use a scratch `DATA_DIR`.
- `npm run typecheck`, `npm test`, `npm run check:perms` before shipping; `npm run e2e` when a change touches sending, review, downloads or auth.
