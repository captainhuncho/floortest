/**
 * Ordered Postgres migrations. Append new ones; never edit an applied one.
 * Timestamps are epoch milliseconds (bigint) throughout.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
create table users (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  handle text not null unique,
  plan text not null default 'free',
  active_collection_id bigint,
  role_line text not null default '',
  cover_key text,
  page_style text not null default 'classic' check (page_style in ('classic', 'stage')),
  notifications_seen_at bigint,
  notify_submissions text not null default 'digest' check (notify_submissions in ('instant', 'digest', 'off')),
  digest_hour int not null default 9,
  quiet_start int,
  quiet_end int,
  notify_alerts int not null default 1,
  tz text not null default 'UTC',
  last_digest_at bigint,
  alert_full_sent_at bigint,
  referral_code text unique,
  referred_by bigint references users(id) on delete set null,
  referral_rewarded_at bigint,
  bonus_songs int not null default 0,
  paused_at bigint,
  pause_until bigint,
  pause_message text not null default '',
  created_at bigint not null
);

create table sessions (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires_at bigint not null,
  created_at bigint not null
);
create index sessions_user on sessions(user_id);

create table password_resets (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires_at bigint not null,
  used_at bigint,
  created_at bigint not null
);

create table collections (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  name text not null,
  created_at bigint not null,
  closes_at bigint,
  brief_wanted text not null default '',
  bpm_min int,
  bpm_max int,
  brief_note text not null default '',
  genres text not null default ''
);
create index collections_user on collections(user_id);
alter table users add constraint users_active_collection_fk
  foreign key (active_collection_id) references collections(id) on delete set null;

create table senders (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  email text not null,
  name text not null,
  created_at bigint not null,
  verified_at bigint,
  verify_token text unique,
  blocked_at bigint,
  unique (user_id, email)
);

create table tracks (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  collection_id bigint references collections(id) on delete set null,
  sender_id bigint not null references senders(id) on delete cascade,
  token text not null unique,
  title text not null,
  artist text not null,
  message text not null default '',
  release_status text not null default '',
  mix_status text not null default '',
  genre text not null default '',
  file_key text,
  original_name text not null,
  mime text not null,
  size bigint not null,
  duration double precision,
  bpm double precision,
  peaks text,
  played_at bigint,
  downloaded_at bigint,
  decision text check (decision in ('kept', 'passed')),
  decided_at bigint,
  replied_at bigint,
  receiver_notified_at bigint,
  deleted_at bigint,
  created_at bigint not null
);
create index tracks_user_live on tracks(user_id, deleted_at, created_at);
create index tracks_sender on tracks(sender_id);
create index tracks_collection on tracks(collection_id);

create table events (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  sender_id bigint not null references senders(id) on delete cascade,
  track_id bigint references tracks(id) on delete set null,
  type text not null,
  detail text not null default '',
  created_at bigint not null
);
create index events_user on events(user_id, created_at desc);
create index events_sender on events(sender_id, created_at);

create table outbox (
  id bigint generated always as identity primary key,
  user_id bigint references users(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null,
  audience text not null default 'sender',
  created_at bigint not null
);
create index outbox_user on outbox(user_id, audience, created_at desc);

-- Sliding-window rate limits (uploads per IP/email, logins, contact form, resets).
create table rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  created_at bigint not null
);
create index rate_events_lookup on rate_events(bucket, key, created_at);

-- Direct-to-storage uploads that have been authorised but not yet completed.
create table uploads (
  id text primary key,
  receiver_id bigint not null references users(id) on delete cascade,
  file_key text not null,
  ext text not null,
  size bigint not null,
  meta text not null,
  ip text not null,
  created_at bigint not null
);
`,
  },
  {
    // Hosted Postgres (e.g. Supabase) may expose the public schema through an HTTP API with a
    // public key. FloorTest never uses that API, so lock every table: with RLS on and no policies,
    // API roles see nothing. The app connects as the table owner, which RLS doesn't restrict.
    id: "0002_lock_public_api",
    sql: `
alter table users enable row level security;
alter table sessions enable row level security;
alter table password_resets enable row level security;
alter table collections enable row level security;
alter table senders enable row level security;
alter table tracks enable row level security;
alter table events enable row level security;
alter table outbox enable row level security;
alter table rate_events enable row level security;
alter table uploads enable row level security;
alter table schema_migrations enable row level security;
`,
  },
  {
    // What the account holder did, for their own audit trail. Separate from desk events, which
    // are mostly about senders and tracks and can't carry account-level actions.
    id: "0003_account_log",
    sql: `
create table account_log (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  action text not null,
  detail text not null default '',
  track_id bigint references tracks(id) on delete set null,
  created_at bigint not null
);
create index account_log_user on account_log(user_id, created_at desc);
alter table account_log enable row level security;
`,
  },
  {
    // Prepare for set works in batches: clearing takes kept tracks off the page without un-keeping them.
    id: "0004_set_cleared",
    sql: `
alter table tracks add column set_cleared_at bigint;
`,
  },
];
