# FloorTest Code Style

This guide records how FloorTest is currently built. Prefer consistency with the surrounding code over introducing a second pattern.

## Principles

- Keep the receiver workflow fast: play, decide, reply and move on.
- Keep security and ownership checks on the server.
- Use plain product language instead of internal or technical terminology.
- Make the smallest coherent change; avoid unrelated rewrites.
- Preserve existing behavior unless the task explicitly changes it.
- Prefer readable code and explicit states over clever abstraction.
- Treat mobile as a first-class product surface, not a reduced desktop view.

## Stack and language

- Next.js App Router, React and TypeScript.
- Strict TypeScript; do not introduce `any` to bypass a design problem.
- Server Components by default. Add `"use client"` only when browser state, effects, event handlers or browser APIs are required.
- PostgreSQL through the project database layer in `src/lib/db/`.
- Tailwind utility classes and the existing design tokens/classes.
- Path imports use `@/` for code under `src/`.

## Files and naming

- React components and their files use PascalCase: `ReviewPanel.tsx`.
- Route directories follow Next.js conventions and use lower-case URL segments.
- Library modules use concise lower-case names: `review.ts`, `storage.ts`.
- Functions and variables use camelCase.
- Types and interfaces use PascalCase.
- Constants use upper snake case only when they are true shared constants.
- Database tables and columns use snake_case.
- Keep a component near the route that owns it unless it is genuinely reused.
- Do not add index/barrel files merely to shorten imports.

## React and Next.js

- Fetch server data in Server Components or server-only libraries.
- Use server actions for authenticated form mutations where they fit the existing flow.
- Use route handlers for streaming, storage, webhooks, external callbacks and browser-facing API operations.
- Validate authorization inside the server operation, not only in the page that links to it.
- Do not trust client-hidden inputs, disabled controls or route parameters.
- Keep URL search parameters as the source of truth for shareable filters.
- Provide loading, empty, error, disabled and success states for asynchronous interactions.
- Preserve progressive enhancement for forms where practical.
- Use semantic HTML, visible focus states, useful labels and at least 44px touch targets on mobile.

## Components and state

- Keep components focused on one product responsibility.
- Prefer derived values over duplicated state.
- Avoid effects for values that can be computed while rendering.
- Keep state local until two real consumers require sharing.
- Reuse established components such as buttons, cards, toasts and form controls.
- Destructive actions require clear confirmation and an outcome message.
- Do not display controls that have no working action in production.

## Data and server code

- Parameterize every SQL value. Never assemble user values into SQL strings.
- Keep ownership checks adjacent to resource loading.
- Use the project's transaction support for multi-step state transitions.
- Make jobs, webhook handling and state transitions idempotent.
- Put product-wide labels and definitions in one shared module when multiple surfaces must agree.
- Do not leak database errors, stack traces, SQL, storage keys or tokens to clients.
- Log enough context to operate the system without logging private messages, filenames, email bodies, tokens or signed URLs.

## API responses

- Return controlled JSON errors from application APIs: `{ "error": "Useful message" }`.
- Use the existing status semantics: 400 invalid input, 401 signed out or missing proof, 403 forbidden, 404 absent or deliberately hidden, 409 state conflict, 413 too large, 429 rate limited and 500 unexpected failure.
- Validate and bound JSON, arrays, strings and numbers before using them.
- Keep internal routes implementation details; do not treat them as a stable external contract.

## Styling and copy

- Use the existing FloorTest palette, typography, spacing, borders and responsive breakpoints.
- Acid lime is an accent for status and primary action, not a background for every surface.
- Avoid generic SaaS dashboards, decorative metric cards and large empty areas.
- Prefer `Floor`, `Review Queue`, `Collections`, `Prepare for set`, `Send`, `Contacts` and `Activity` as established navigation labels.
- Use `Keep`, `Not for me` and `Reply`. Do not reintroduce `Pass`, `Could be better`, `Needs work` or `Incoming` without an explicit product decision.
- Sender-visible statuses are Delivered, Listened, Downloaded, Replied and Played out. Receiver decisions remain private by default.

## Comments and documentation

- Comments explain intent, invariants or a non-obvious trade-off—not syntax.
- Document security-sensitive token, storage and state-transition behavior.
- Update the relevant guide and `HANDOFF.md` when an architectural or product contract changes.
- Do not leave stale feature claims in `README.md`, product copy or screenshots.

## Verification

Run before handing off a normal change:

```bash
npm run typecheck
npm test
npm run build
```

Add focused tests for bug fixes and high-risk paths. For user-facing work, also test the affected path on desktop and a narrow mobile viewport. Use Preview for end-to-end verification before Production.
