# FloorTest Database Guide

FloorTest uses PostgreSQL semantics in every environment. Local development uses embedded PGlite; deployed environments use PostgreSQL through `DATABASE_URL`, currently designed for a pooled serverless connection.

## Sources of truth

- Database client and query helpers: `src/lib/db/`
- Schema and migrations: `src/lib/db/migrations.ts`
- Explicit migration runner: `scripts/migrate.ts`
- Domain types: `src/lib/db/index.ts`
- Local data: `data/pg/`

Do not introduce Prisma or a second ORM. Do not hand-edit production tables outside an incident procedure or reviewed migration.

## Data model overview

The main relationships are:

- A `users` row represents a receiver account.
- A receiver owns collections, senders, tracks, events, settings and operational records.
- A sender belongs to a receiver; the same email may therefore have separate receiver-specific relationships.
- A collection groups submissions and may be the receiver's active destination.
- A release groups multiple tracks sent together while preserving per-track receipts and events.
- A track owns the metadata that points to a private storage object; the audio bytes do not live in PostgreSQL.
- Events provide receiver and sender lifecycle history.
- Sessions and sensitive tokens are stored as hashes where the flow requires reusable secrets.
- Share, team, stem, upload and deletion tables model bounded access and asynchronous file lifecycle work.

Inspect the current migration file before relying on a field name; this guide describes responsibilities rather than freezing every column.

## Query rules

- Use the shared `q` interface and parameter placeholders.
- Parameterize all user-controlled values.
- Scope receiver-owned queries by `user_id` or use an established ownership helper.
- Authentication is not authorization. Query the resource through its owner or membership relationship.
- Use transactions for state transitions that must succeed or fail together.
- Lock or atomically claim rows when concurrent requests could both act.
- Make scheduled jobs, retries and webhook processing idempotent.
- Bound list queries and use stable ordering.
- Add an index only for a demonstrated query pattern or production plan; document why it exists.

## Migrations

- Append migrations; never reorder, rename or rewrite a migration that may have run.
- Give each migration a unique sequential identifier and a clear purpose.
- Prefer backward-compatible expansion before code starts depending on a new column.
- Keep destructive changes separate and provide a recovery/rollback plan.
- A migration must tolerate the deployment model and advisory-lock strategy already used by FloorTest.
- Test against a clean local database and a realistic upgraded database.
- Run `npm run db:migrate` explicitly for verification even though first-request migration support exists.
- Record the migration in the commit message and the shipped item under Done in `docs/06-plan.md`.

## Time, state and identifiers

- Existing application timestamps are numeric epoch milliseconds unless a table explicitly establishes a different representation.
- Generate security-sensitive public tokens with cryptographically secure randomness.
- Store reusable authentication tokens as hashes; compare sensitive values safely.
- Do not expose sequential database identifiers as authorization.
- Keep enum-like product values centralized in code and validate them before persistence.

## Audio and object storage

PostgreSQL stores metadata and private object keys. Storage contains audio, stems, artwork, pending uploads and backups.

- Never make the bucket public.
- Create an upload record before granting a bounded direct-upload URL.
- Seal and validate the object before creating a usable track.
- Queue object deletion transactionally with database deletion so failures can be retried.
- Do not remove the only database reference to an object until its disposition is recorded.
- Database backup alone does not recover audio; object-storage recovery is a separate operational requirement.

## Retention and deletion

- Retention values in code, UI, Terms, Privacy, email and scheduled jobs must agree.
- Undecided, Not for me and kept tracks may have different retention behavior.
- Account or sender erasure includes relational data and every associated object.
- Use the durable storage-deletion queue for audio, stems, artwork and pending uploads.
- Deletion routines must be idempotent and observable.
- Backups need an expiry policy, restore procedure and documented treatment after privacy deletion.

## Connection and performance guidance

- Production Vercel/serverless traffic uses Neon's pooled connection string.
- Every table has row-level security on (the app connects as the owner, which RLS skips; any other role sees nothing). A new table's migration must enable it; `npm run check:perms` fails otherwise.
- Per-person policies for the role `ft_person` (migration `0097_person_rules`) on users, account_members, collections, tracks, senders, releases, events, stems, listens, track_comments, track_shortlist and held_replies: a person sees only rows on their own desk or a team desk they belong to (not one FloorTest has suspended, migration `0109`). On `users` it may read only the columns in `USER_COLUMNS` and change only its own profile fields (migration `0108`); `check:perms` fails if it can touch a column holding a sign-in secret. Code opts in with `asPerson` (`src/lib/db`); details in [02-technical.md](02-technical.md), Limits and guards. A table granted to `ft_person` needs a policy for it, and any plain sequence behind a table it may add rows to needs usage (`held_replies`, migration `0118`), or `check:perms` fails.
- Do not create an unbounded connection per request.
- Avoid N+1 queries on track, sender and collection lists.
- Check query plans before adding indexes or denormalized counters.
- Watch connection count, slow queries, migration duration, table growth and scheduled-job duration.
- Load-test submission start/completion and dashboard concurrency before materially increasing beta access.

## Backups and recovery

- Required backup must succeed before destructive nightly retention work.
- Backups are private and encrypted when configured.
- Backup credentials should be isolated from ordinary browser-facing storage access.
- Expire every object older than the retention cutoff, not only the object from one exact date.
- Run restore drills against a non-production database and verify table counts and essential relationships.
- Record recovery point and recovery time expectations before calling the service production-ready.
- Production restore steps (what to reapply after a restore: deletions and sign-ins): [operations.md](operations.md), Backups and restore.
- Sign-in tables are never backed up (`SKIP` in `src/lib/backup.ts`), including `two_step_tickets` and `app_refresh_spent`; add any new session or one-time-code table there.

## Safe local work

`npm run seed` is destructive to local demo data and must refuse production services. Stop the local development server before reseeding PGlite because the embedded database is single-process.

Useful commands:

```bash
npm run db:migrate
npm run seed
npm test
npm run typecheck
```

Never paste production connection strings, row contents, sender emails, private messages or tokens into issues, logs or handoff documents.
