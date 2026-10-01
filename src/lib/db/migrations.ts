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
  {
    id: "0005_invite_code",
    sql: `
alter table users add column invite_code text;
create index users_invite_code on users(invite_code);
`,
  },
  {
    // Account security: verified receiver emails, optional authenticator-app sign-in, sign-in alerts.
    // Accounts created before this are treated as verified.
    id: "0006_account_security",
    sql: `
alter table users add column email_verified_at bigint;
update users set email_verified_at = created_at;
alter table users add column email_verify_token text unique;
alter table users add column totp_secret text;
alter table users add column totp_enabled_at bigint;
alter table users add column totp_last_step bigint;
alter table users add column recovery_codes text not null default '[]';
alter table users add column signin_alerts int not null default 1;
`,
  },
  {
    // Platform admin: suspensions, invite codes managed in-app, and a log of every admin action.
    id: "0007_admin",
    sql: `
alter table users add column suspended_at bigint;
alter table users add column suspended_reason text not null default '';
create table invites (
  code text primary key,
  max_uses int not null default 25,
  note text not null default '',
  created_at bigint not null,
  revoked_at bigint
);
create table admin_log (
  id bigint generated always as identity primary key,
  admin_id bigint references users(id) on delete set null,
  action text not null,
  target text not null default '',
  detail text not null default '',
  created_at bigint not null
);
create index admin_log_time on admin_log(created_at desc);
alter table invites enable row level security;
alter table admin_log enable row level security;
`,
  },
  {
    // Support tools: a contact inbox and a feed of things that went wrong.
    id: "0008_support",
    sql: `
create table contact_messages (
  id bigint generated always as identity primary key,
  user_id bigint references users(id) on delete set null,
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  handled_at bigint,
  created_at bigint not null
);
create index contact_messages_time on contact_messages(created_at desc);
create table incidents (
  id bigint generated always as identity primary key,
  kind text not null,
  message text not null,
  detail text not null default '',
  path text not null default '',
  created_at bigint not null
);
create index incidents_time on incidents(created_at desc);
alter table contact_messages enable row level security;
alter table incidents enable row level security;
`,
  },
  {
    // Personal invites: a single-use code tied to one email address.
    id: "0009_invite_email",
    sql: `
alter table invites add column email text;
alter table invites add column sent_at bigint;
create index invites_email on invites(email);
`,
  },
  {
    // Beta features: waitlist, onboarding checklist, reply templates, "played it out".
    id: "0010_beta_features",
    sql: `
create table waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  name text not null default '',
  role text not null default '',
  link text not null default '',
  note text not null default '',
  invited_at bigint,
  created_at bigint not null
);
alter table waitlist enable row level security;
alter table users add column onboarding_dismissed_at bigint;
alter table users add column reply_templates text not null default '[]';
alter table tracks add column played_out_at bigint;
alter table tracks add column played_out_note text not null default '';
`,
  },
  {
    // Duplicate flags, 14-day follow-up nudges, and small app-wide state (e.g. last admin digest).
    id: "0011_standby_batch",
    sql: `
alter table tracks add column duplicate_of bigint references tracks(id) on delete set null;
alter table tracks add column nudged_at bigint;
create table app_state (
  key text primary key,
  value text not null,
  updated_at bigint not null
);
alter table app_state enable row level security;
`,
  },
  {
    // Light identity verification (profile links + a code in a bio, reviewed by staff) and
    // link names that can't be claimed without staff approval.
    id: "0012_identity",
    sql: `
alter table users add column identity_status text not null default 'none' check (identity_status in ('none', 'pending', 'verified', 'rejected'));
alter table users add column identity_code text;
alter table users add column identity_links text not null default '[]';
alter table users add column identity_note text not null default '';
alter table users add column identity_submitted_at bigint;
alter table users add column identity_verified_at bigint;
create table protected_names (
  handle text primary key,
  note text not null default '',
  created_at bigint not null
);
alter table protected_names enable row level security;
`,
  },
  {
    // Receivers can send music too, from their account: the sender row remembers which account it was.
    id: "0013_account_sends",
    sql: `
alter table senders add column account_id bigint references users(id) on delete set null;
create index senders_account on senders(account_id);
`,
  },
  {
    // Repair two placeholder values that escaped into Maxwell's beta receiver page.
    // The exact predicates make this a no-op for every other account and collection.
    id: "0014_maxwell_public_page_repair",
    sql: `
update users set role_line = 'DJ / Performer' where handle = 'maxwell' and role_line = 'MA?';
update collections set name = 'Afterlife'
where name = 'MA?' and user_id = (select id from users where handle = 'maxwell');
`,
  },
  {
    // The link name someone typed on the home page before joining the waitlist. Not reserved: a hint for their invite.
    id: "0015_waitlist_handle",
    sql: `
alter table waitlist add column handle text not null default '';
`,
  },
  {
    // Storage heads-up at 80%, a warning before auto-deletion, and opt-in product news.
    id: "0016_storage_and_product_notices",
    sql: `
alter table users add column alert_80_sent_at bigint;
alter table users add column notify_product int not null default 0;
alter table tracks add column expiry_warned_at bigint;
`,
  },
  {
    // "Clear all" in the bell hides everything before this moment.
    id: "0017_notifications_cleared",
    sql: `
alter table users add column notifications_cleared_at bigint;
`,
  },
  {
    // Receivers can ask for stems; senders upload them to the track from their receipt page.
    id: "0018_stems",
    sql: `
alter table tracks add column stems_requested_at bigint;
create table stems (
  id bigint generated always as identity primary key,
  track_id bigint not null references tracks(id) on delete cascade,
  file_key text not null,
  name text not null,
  mime text not null,
  size bigint not null,
  created_at bigint not null
);
create index stems_track on stems(track_id);
alter table stems enable row level security;
`,
  },
  {
    // Sharing with colleagues: a collection can allow it; each track remembers whether it was allowed when it was sent.
    id: "0019_sharing",
    sql: `
alter table collections add column allow_sharing int not null default 0;
alter table tracks add column share_ok int not null default 0;
create table track_shares (
  id bigint generated always as identity primary key,
  track_id bigint not null references tracks(id) on delete cascade,
  token text not null unique,
  created_at bigint not null,
  expires_at bigint not null,
  revoked_at bigint,
  plays int not null default 0
);
create index track_shares_track on track_shares(track_id);
alter table track_shares enable row level security;
`,
  },
  {
    // Set prep on kept tracks: an energy rating (1–5) and labelled cue points, exported to Rekordbox.
    id: "0020_cues_energy",
    sql: `
alter table tracks add column energy int check (energy between 1 and 5);
alter table tracks add column cues text not null default '[]';
`,
  },
  {
    // Colleague downloads from share links (paid plans only).
    id: "0021_share_downloads",
    sql: `
alter table track_shares add column downloads int not null default 0;
`,
  },
  {
    // Share downloads are fixed by the receiver's plan when the track was sent; colleagues sign in, and access is logged per account.
    id: "0022_share_accounts",
    sql: `
alter table tracks add column share_download int not null default 0;
create table share_access (
  id bigint generated always as identity primary key,
  share_id bigint not null references track_shares(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  kind text not null check (kind in ('play', 'download')),
  created_at bigint not null
);
create index share_access_share on share_access(share_id);
alter table share_access enable row level security;
`,
  },
  {
    // A receiver asks the artist, per track, to share it with a non-commercial partner (playing and promotion only).
    id: "0023_share_requests",
    sql: `
create table share_requests (
  id bigint generated always as identity primary key,
  track_id bigint not null references tracks(id) on delete cascade,
  note text not null default '',
  downloads int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'allowed', 'declined')),
  created_at bigint not null,
  decided_at bigint
);
create index share_requests_track on share_requests(track_id);
alter table share_requests enable row level security;
`,
  },
  {
    // An artist's Allow has a cancel window; a cancelled consent is kept for the record.
    id: "0024_share_consent_cancel",
    sql: `
alter table share_requests drop constraint if exists share_requests_status_check;
alter table share_requests add constraint share_requests_status_check check (status in ('pending', 'allowed', 'declined', 'cancelled'));
`,
  },
{
    // Platform-wide sender blocks (one address or a whole domain), and copyright takedown cases.
    id: "0025_blocks_takedowns",
    sql: `
create table platform_blocks (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('email', 'domain')),
  value text not null unique,
  reason text not null default '',
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null
);
alter table platform_blocks enable row level security;
create table takedowns (
  id bigint generated always as identity primary key,
  track_id bigint references tracks(id) on delete set null,
  track_label text not null default '',
  claimant text not null,
  claimant_email text not null,
  basis text not null default '',
  status text not null default 'open' check (status in ('open', 'removed', 'rejected')),
  notes text not null default '',
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null,
  decided_at bigint
);
create index takedowns_status on takedowns(status);
alter table takedowns enable row level security;
`,
  },
{
    // Every suspension and restore on an account, kept as history (the users row only holds the current state).
    id: "0026_account_actions",
    sql: `
create table account_actions (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  kind text not null check (kind in ('suspended', 'unsuspended')),
  reason text not null default '',
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null
);
create index account_actions_user on account_actions(user_id, created_at desc);
alter table account_actions enable row level security;
`,
  },
{
    // Announcements to users (bell, optional email), and admin feature switches.
    id: "0027_announcements_switches",
    sql: `
create table announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null default '',
  href text not null default '',
  audience text not null default 'all' check (audience in ('all', 'free', 'pro', 'team')),
  emailed int not null default 0,
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null
);
create index announcements_time on announcements(created_at desc);
alter table announcements enable row level security;
create table feature_switches (
  feature text primary key,
  plans text not null default '[]',
  users text not null default '[]',
  admin_id bigint references users(id) on delete set null,
  updated_at bigint not null
);
alter table feature_switches enable row level security;
`,
  },
{
    // Email changes wait for a click from the new address; old handles forward (and stay reserved) for a while.
    id: "0028_email_change_handle_history",
    sql: `
alter table users add column pending_email text;
alter table users add column pending_email_token text unique;
alter table users add column pending_email_at bigint;
create table handle_history (
  old_handle text primary key,
  user_id bigint not null references users(id) on delete cascade,
  forward int not null default 1,
  created_at bigint not null,
  expires_at bigint not null
);
create index handle_history_user on handle_history(user_id);
alter table handle_history enable row level security;
`,
  },
{
    // Where people came from (UTM tags or the referring site), for the waitlist and sign-ups.
    id: "0029_sources",
    sql: `
alter table waitlist add column source text not null default '';
alter table users add column signup_source text not null default '';
`,
  },
{
    // A consent becomes final exactly once: cancel and finalise both claim the row, and only one can win.
    id: "0030_share_consent_final",
    sql: `
alter table share_requests add column finalized_at bigint;
update share_requests r set finalized_at = r.decided_at from tracks t where t.id = r.track_id and r.status = 'allowed' and t.share_ok = 1;
`,
  },
{
    // Files waiting to be deleted from storage. Recorded before the rows that point to them go, so none is lost.
    id: "0031_storage_deletions",
    sql: `
create table storage_deletions (
  file_key text primary key,
  reason text not null default '',
  attempts int not null default 0,
  last_error text,
  created_at bigint not null,
  last_attempt_at bigint
);
alter table storage_deletions enable row level security;
`,
  },
];
