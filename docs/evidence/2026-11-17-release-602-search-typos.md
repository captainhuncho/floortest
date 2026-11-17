# Release: #602, search forgives typos (17 Nov 2026)

Search forgives typos and ranks the closest match first, in-house with Postgres `pg_trgm`. 12 files, +234 −32.
Shipped on the owner's "ship it #602" in the Desk (lane:owner: migration). The owner tried it on `mobile-next`
(`a1b18fbe`) first and said it works.

| Item | Value |
|---|---|
| PR | #602 |
| Head | `365db781` |
| Merge commit | `e91e9074` |
| Production deploy | 7850735048, success |
| Rollback target | deploy 7850354719 (`ae19fce6`, #591); the indexes stay and are harmless to the old code |

## Migration 0155_search_trgm
`create extension if not exists pg_trgm` plus four GIN trigram indexes: `tracks_title_trgm`, `tracks_artist_trgm`,
`tracks_genre_trgm`, `senders_name_trgm`. Plain `CREATE INDEX` (not concurrent). Production size measured before the
merge: 37 tracks, 14 senders, so the build lock lasted well under a second. Checked after the deploy: extension
installed, all four indexes present, `schema_migrations` has 0155.

## Checks
| Check | Commit | Result |
|---|---|---|
| CI: checks, Analyze, CodeQL, dependency-review, Vercel | `365db781` | passed |
| Full e2e (Backend session) | `365db781` | 118 passed, 1 flaky that passed on rerun |
| Safety review, two blind reviewers | `365db781` | cleared, both passed |
| Owner's try on `mobile-next` | `a1b18fbe` | works |
| Health `/api/health` | production | 200 |

## After the merge
`main` merged into `mobile-next` as `cebce92a` (no file changes: #602 was already there).

## Live versus unfinished
Live: typo-tolerant search. Open report PRs (docs only): #605 (#604), #607 (#591).
