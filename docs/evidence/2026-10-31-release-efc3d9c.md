# 31 Oct 2026: e2e ports are configurable (#212), plus the day's fast-lane merges

Owner's words in the desk session: "ship #212; yes BACKEND is mine, add it to the session list".

## Build
- Release branch head (checked): `efc3d9c` (fast-forward onto `main` `5b6fd1c`).
- Contains: #212 `e2e-ports` at `efc3d9c` (Build), `lane:standard`.
- Previous release: #207 (#203 receipt columns, #205 menu offset), merge `03d8f66`, deployment
  `dpl_CWJSLaPEYfQmzVAEu7fCdxeX5PW9` (no migrations).
- Fast-lane merges since then (new process, `docs/working.md` rule 13, owner 31 Oct):
  - #208 `search-account-tidy`, head `3f72237`, merge `eaa453c`, deployment `dpl_D3r5LwryAuNUsfn6vaZGjMWKBH6X`
    (look-only: search box, Account centred, Up next play button; Build's checks incl. e2e 52/52 on that head).
  - #209 `docs-release-lanes`, head `4ea2320`, merge `5b6fd1c`, deployment `dpl_EKM2ucjCbZpRQNL6cYgzWJ2CyhHV`
    (docs only: the release lanes in `docs/working.md` and `CLAUDE.md`).
- This release's merge commit and production deployment go in the next release's report.

## What shipped
- `playwright.config.ts` reads `E2E_PORT` and `E2E_SCANNER_PORT` (defaults 3210 and 3211 unchanged); the
  scanner-wake, batch, api-v1 and guards specs follow them; `docs/14. Testing & QA.md` explains running a second e2e side
  by side (Build used 3220/3221). Test setup only; the site does not change. No migrations.

## Checks
All on `efc3d9c`, locally, after `npm ci`, on the default ports. Checks started when Build's "ready" arrived, before the
owner's word (owner, 31 Oct).

| Check | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run lint` | passed (0 errors; 2 warnings already on main) |
| `npm test` | passed (334/334) |
| `npm run check:perms` | passed |
| `npm audit --omit=dev` | passed (0 vulnerabilities) |
| `npm run e2e`, first run | 51/52 (6.2 min): `e2e/no-collection.spec.ts` "a track sent to it lands in the Review Queue, unsorted" failed (`toBeVisible` timeout) |
| That spec alone, `--repeat-each=3` | 5/6: the same test failed once more |
| `npm run e2e`, rerun | passed (52/52 in 4.2 min) |
| Build's run on `22cbc61` with `E2E_PORT=3220 E2E_SCANNER_PORT=3221` | e2e 52/52 |

Flaky test: the same `no-collection` test failed once on 30 Oct (release `740fe08`), before #212 existed, so #212 did
not cause it. It also fails when run alone, so it may be a real intermittent delay before a sent track shows in the
Review Queue, not only a slow machine. Build is finding the root cause (owner's rule: fix the app if that's the cause,
before touching timeouts).

## Rollback
Last good deployment: `dpl_EKM2ucjCbZpRQNL6cYgzWJ2CyhHV` (`5b6fd1c`). No migrations; an Instant Rollback is safe.
