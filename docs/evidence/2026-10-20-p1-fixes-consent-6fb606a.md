# 20 Oct 2026: three P1 security fixes and the cookie banner

## Build
- Production: `main` at `6fb606a`, deployment `dpl_6mSKTUkoYWXXPVD3xndLiqXvb9He`, READY. Ship branch `ship-p1-consent-1020`, built from `main` (`cacb29a`).
- Preview: `mobile-next` already had the same changes (`e2f4017`); `main` merged into it after the ship.

## What shipped
- Offline links stop when access ends: a link is tied to the track, desk, person and sign-in, and every download re-checks them (`fca9408`).
- Listened is counted by the server from real playback time, not a number the browser sends; migration `0096_listen_sessions` adds the `listens` table (`8ff78d6`, short tracks `e672a3d`).
- On the live site a missing or broken virus scanner refuses uploads instead of letting them through unscanned; `/api/health` with the cron secret is now a readiness check; `.env.example` lists every setting (`7c717c5`).
- Cookie banner: Vercel Analytics and browser Sentry start only after Accept; "Not now" is remembered in `ft_consent`; "Cookie settings" reopens it (`da24f05`, `642c43f`, cherry-picked as `6fb606a`).

## Checks
| Check | Build | Result |
|---|---|---|
| Typecheck, lint (0 errors) | ship branch | passed |
| Unit tests | ship branch | passed (112 files, including `tests/offline.test.ts`, `tests/listened.test.ts`, `tests/scan.test.ts`, `tests/consent.test.ts`) |
| `check:perms` (desk roles, RLS on 61 tables) | ship branch | passed |
| `npm audit --omit=dev` | ship branch | passed (0 vulnerabilities) |
| Production build (migration 0096 applied first) | ship branch | passed |
| Playwright e2e | ship branch | passed (40 of 40) |
| Real-browser Listened: a 10 s play counts once; a forged `{seconds}` gets 400; a check-in without play and 12 rapid check-ins earn nothing | local copy of `8ff78d6` | passed |
| Cookie banner shows on first visit; no third-party request, no Vercel Analytics, Sentry not started before a choice | live, `6fb606a` | passed |
| "Not now" saved, nothing third-party after it, Sentry and Analytics stay off | local copy of `fb8e808` | passed |
| `/api/health` | live, `6fb606a` | passed (`{"ok":true}`) |
| Accept switches Analytics and Sentry on: `ft_consent=accepted`, banner closes, Vercel Analytics loads from our own domain, browser Sentry starts, no request to another host | live, `6fb606a` (owner's go, 20 Oct) | passed |
| Offline download on a phone after sign-out or team removal | phone app | blocked: needs a real phone with the app |
| Short-track check-in (`e672a3d`) in a browser | — | blocked: unit tests and typecheck only |

## Status
- Live: all four changes above.
- Open for the owner and the lawyer: the Privacy Policy still says FloorTest shows no cookie banner, and the Cookie Policy doesn't list `ft_consent`, Vercel Analytics or Sentry as consent-based. These are legal pages; no session changes them.
- Uploads on the live site now depend on the scanner: if it is down, senders see "couldn't run the virus check" and Ops → Incidents shows "Virus check unavailable".

## Rollback
Last good deployment: `dpl_4Wr1Q8qLTE4HQe3vtvrjor2NwJX1` (`cacb29a`). Safe to promote: migration 0096 only adds a table the old code never reads. After a rollback the old player sends seconds again and Listened goes back to trusting the browser.

## Next
The phone check of offline links (sign-out and team removal stop a saved link).
