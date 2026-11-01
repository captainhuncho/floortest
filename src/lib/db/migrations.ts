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
{
    // Incidents can be marked handled; indexes for the nightly jobs and admin queries as data grows.
    id: "0032_resolved_and_indexes",
    sql: `
alter table incidents add column resolved_at bigint;
create index incidents_kind_time on incidents(kind, created_at desc);
create index tracks_retention_unreviewed on tracks(created_at) where deleted_at is null and decision is null;
create index tracks_retention_passed on tracks(decided_at) where deleted_at is null and decision = 'passed';
create index tracks_played_out on tracks(played_out_at) where played_out_at is not null;
create index rate_events_time on rate_events(created_at);
create index account_log_time on account_log(created_at);
create index outbox_status_time on outbox(status, created_at desc);
`,
  },
{
    // Site-wide on/off switches flipped from admin (sharing, bot check, open sign-up, pause uploads).
    id: "0033_switches",
    sql: `
create table switches (
  key text primary key,
  on_ int not null,
  admin_id bigint references users(id) on delete set null,
  updated_at bigint not null
);
alter table switches enable row level security;
`,
  },
{
    // Sign in with a 6-digit code emailed to the account address (instead of a password).
    id: "0034_login_codes",
    sql: `
create table login_codes (
  user_id bigint primary key references users(id) on delete cascade,
  code_hash text not null,
  attempts int not null default 0,
  expires_at bigint not null,
  created_at bigint not null
);
alter table login_codes enable row level security;
`,
  },
{
    // Send folders (paid, off in the beta): tracks sent together share a batch id so the receiver sees them as one folder.
    id: "0035_track_batches",
    sql: `
alter table tracks add column batch_id text;
create index tracks_batch on tracks(batch_id) where batch_id is not null;
`,
  },
{
    // Onboarding emails, each sent once: welcome on confirming the email, and a nudge 7 days later if nothing has arrived.
    id: "0036_onboarding_emails",
    sql: `
alter table users add column welcomed_at bigint;
alter table users add column first_track_nudged_at bigint;
update users set welcomed_at = created_at, first_track_nudged_at = created_at;
`,
  },
{
    // Shared collections (Team): teammates can listen to a collection's tracks and vote keep or pass with a note. The owner decides.
    id: "0037_shared_collections",
    sql: `
create table collection_members (
  collection_id bigint not null references collections(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  added_at bigint not null,
  primary key (collection_id, user_id)
);
create index collection_members_user on collection_members(user_id);
create table track_votes (
  track_id bigint not null references tracks(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  vote text not null check (vote in ('keep','pass')),
  note text not null default '',
  created_at bigint not null,
  primary key (track_id, user_id)
);
alter table collection_members enable row level security;
alter table track_votes enable row level security;
`,
  },
{
    // Playing a track in DJ sets is the sender's choice (off by default). Tracks sent earlier were sent under terms that allowed it.
    id: "0038_sets_consent",
    sql: `
alter table tracks add column sets_ok int not null default 0;
update tracks set sets_ok = 1;
`,
  },
{
    // Link names can change once a year; an undo back to the old name within the hold doesn't count.
    id: "0039_handle_changed_at",
    sql: `
alter table users add column handle_changed_at bigint;
`,
  },
{
    // Tap speed: how long the screen takes to respond after a tap or key press. No account, IP or query string is stored.
    id: "0040_tap_speed",
    sql: `
create table tap_timings (
  id bigint generated always as identity primary key,
  created_at bigint not null,
  path text not null,
  target text not null default '',
  ms int not null,
  device text not null default '',
  browser text not null default ''
);
create index tap_timings_created on tap_timings(created_at);
alter table tap_timings enable row level security;
`,
  },
{
    // Speed: besides taps, page changes inside the app ("nav") and the first appearance of a freshly opened page ("load").
    id: "0041_speed_kinds",
    sql: `
alter table tap_timings add column kind text not null default 'tap';
create index tap_timings_kind on tap_timings(kind, created_at);
`,
  },
{
    // Removes one batch of four fake timings sent to production by mistake while testing on 2026-10-05.
    // Matched by its exact values and the single timestamp the batch was saved with, so no real timing can match.
    id: "0042_remove_test_timings",
    sql: `
delete from tap_timings where created_at in (
  select created_at from tap_timings
  where path = '/dashboard/collections/:id' and ms = 850 and device = 'phone' and browser = 'Safari' and target = 'link'
) and device = 'phone' and browser = 'Safari' and (
  (path = '/dashboard/collections/:id' and ms = 850 and target = 'link') or
  (path = '/:link' and ms = 1400 and target = 'page') or
  (path = '/dashboard' and ms = 40 and target = 'Keep') or
  (path = '/:link' and ms = 20 and target = '')
);
`,
  },
{
    // Beta partners and feedback: when each account was last active (updated at most hourly), the admin's call notes
    // per person (by email, so invites not yet used can have notes too), and feedback status and page.
    id: "0043_partners_feedback",
    sql: `
alter table users add column last_active_at bigint;
create table partner_notes (
  email text primary key,
  note text not null default '',
  admin_id bigint references users(id) on delete set null,
  updated_at bigint not null
);
alter table partner_notes enable row level security;
alter table contact_messages add column feedback_status text not null default 'new' check (feedback_status in ('new', 'planned', 'fixed', 'wontdo'));
alter table contact_messages add column page text not null default '';
update contact_messages set page = substring(message from '\nPage: ([^\n]*)$'), message = regexp_replace(message, '\n\nPage: [^\n]*$', '')
  where topic like 'Feedback%' and message ~ '\nPage: [^\n]*$';
`,
  },
{
    // Scheduled job history (the latest run per job stays in app_state for the Overview); kept 90 days.
    id: "0044_job_runs",
    sql: `
create table job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at bigint not null,
  ms int not null,
  ok int not null,
  result text not null default ''
);
create index job_runs_job on job_runs(job, started_at);
alter table job_runs enable row level security;
`,
  },
{
    // Delivery tracking from Resend's webhooks: what happened after an email left us, and addresses we stop emailing
    // because they bounced for good or marked us as spam.
    id: "0045_email_delivery",
    sql: `
alter table outbox add column provider_id text;
alter table outbox add column delivery text not null default '';
alter table outbox add column delivery_at bigint;
create index outbox_provider on outbox(provider_id) where provider_id is not null;
create table email_suppressions (
  email text primary key,
  reason text not null check (reason in ('bounced', 'complained')),
  detail text not null default '',
  created_at bigint not null
);
alter table email_suppressions enable row level security;
`,
  },
{
    // Feature use: per account, per day, how often each part of FloorTest was used (no content), for Admin → Feature use.
    id: "0046_feature_use",
    sql: `
create table feature_use (
  user_id bigint not null references users(id) on delete cascade,
  feature text not null,
  day text not null,
  uses int not null default 1,
  primary key (user_id, feature, day)
);
create index feature_use_day on feature_use(day);
alter table feature_use enable row level security;
`,
  },
{
    // Indexes for the queries that run most (backend review, 2026-10-05): the Review Queue's status filters,
    // the duplicate check on every upload, email lookups that ignore case, foreign keys that cascades scan,
    // and the nightly clean-up's age filters. Small tables today, so building them here is quick.
    id: "0047_query_indexes",
    sql: `
create index tracks_user_decision on tracks(user_id, decision, created_at) where deleted_at is null;
create index tracks_user_decided on tracks(user_id, decided_at desc) where deleted_at is null and decision is not null;
create index tracks_user_size on tracks(user_id, size) where deleted_at is null;
create index tracks_sender_title on tracks(sender_id, lower(title)) where deleted_at is null;
create index tracks_duplicate_of on tracks(duplicate_of) where duplicate_of is not null;
create index events_track on events(track_id) where track_id is not null;
create index events_time on events(created_at);
create index contact_messages_user on contact_messages(user_id) where user_id is not null;
create index share_access_user on share_access(user_id);
create index share_access_time on share_access(created_at);
create index senders_email_lower on senders(lower(email));
create index outbox_to_lower on outbox(lower(to_email));
create index outbox_time on outbox(created_at);
create index uploads_receiver on uploads(receiver_id);
create index uploads_time on uploads(created_at);
`,
  },
{
    // Rules the database enforces itself (backend review, 2026-10-05). NOT VALID: they apply to every new or changed
    // row without re-checking old ones, so the update can't fail on historic data. Link names are unique whatever their case.
    id: "0048_constraints",
    sql: `
alter table users add constraint users_plan_known check (plan in ('free', 'pro', 'team')) not valid;
alter table users add constraint users_signin_alerts_flag check (signin_alerts in (0, 1)) not valid;
alter table tracks add constraint tracks_size_positive check (size >= 0) not valid;
alter table tracks add constraint tracks_flags check (share_ok in (0, 1) and share_download in (0, 1) and sets_ok in (0, 1)) not valid;
alter table tracks add constraint tracks_decision_known check (decision is null or decision in ('kept', 'passed')) not valid;
alter table collections add constraint collections_bpm_range check (bpm_min is null or bpm_max is null or bpm_min <= bpm_max) not valid;
alter table collections add constraint collections_sharing_flag check (allow_sharing in (0, 1)) not valid;
create unique index users_handle_lower on users(lower(handle));
`,
  },
{
    // Plans move from code into the database so Admin → Plans can change prices, limits, names, feature lists and
    // which features each plan unlocks, and add or retire plans. Seeded with today's three plans exactly.
    id: "0049_plans_table",
    sql: `
create table plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,23}$'),
  name text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  track_limit int not null check (track_limit > 0),
  blurb text not null default '',
  features text not null default '[]',
  share_downloads int not null default 0 check (share_downloads in (0, 1)),
  featured int not null default 0 check (featured in (0, 1)),
  position int not null default 0,
  retired_at bigint,
  updated_at bigint not null
);
alter table plans enable row level security;
insert into plans (id, name, price_cents, track_limit, blurb, features, share_downloads, featured, position, updated_at) values
  ('free', 'Free', 0, 20, 'Delete a track and the slot returns',
   '["20 active tracks","Your receiving link and public page","Review Queue, collections and Rekordbox export","Receipts and updates for your senders"]', 0, 0, 1, 0),
  ('pro', 'Pro', 699, 500, 'For active DJs and curators',
   '["500 active tracks","Everything in Free","Colleagues can download tracks you share","Paid features as they launch (stems, folders)"]', 1, 1, 2, 0),
  ('team', 'Team', 1299, 2000, 'For labels and crews who listen together',
   '["2,000 active tracks","Everything in Pro","Shared collections: up to 10 teammates listen and vote"]', 1, 0, 3, 0);
alter table users drop constraint if exists users_plan_known;
alter table users add constraint users_plan_fk foreign key (plan) references plans(id) not valid;
`,
  },
  {
    // Site wording and images edited in Admin → Site content: a draft and a published copy per page, plus every
    // published version so an older one can be restored.
    id: "0050_site_content",
    sql: `
create table site_content (
  page text primary key,
  draft text not null default '{}',
  published text not null default '{}',
  admin_id bigint references users(id) on delete set null,
  updated_at bigint not null,
  published_at bigint
);
create table site_content_versions (
  id bigint generated always as identity primary key,
  page text not null,
  body text not null,
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null
);
create index site_content_versions_page on site_content_versions (page, created_at desc);
alter table site_content enable row level security;
alter table site_content_versions enable row level security;
`,
  },
  {
    // Who the account is for: a DJ/curator, a producer, or a label/A&R team. Asked at sign-up so beta feedback can be told apart;
    // existing accounts stay unset until they pick in Settings.
    id: "0051_user_kind",
    sql: `
alter table users add column kind text check (kind in ('dj', 'producer', 'label'));
`,
  },
  {
    // Proof of agreement at sign-up: when the person ticked "18 or over and agree to the Terms", and which Terms
    // (the date on the legal pages). Older accounts agreed through the sign-up notice and stay unset.
    id: "0052_terms_acceptance",
    sql: `
alter table users add column terms_accepted_at bigint;
alter table users add column terms_version text;
`,
  },
  {
    // Senders must say whether AI was used to make a track; receivers see it on the track. Older tracks stay unset.
    id: "0053_track_ai_use",
    sql: `
alter table tracks add column ai_use text check (ai_use in ('none', 'partial', 'full'));
`,
  },
  {
    // Admin CRM: announcements go to an exact list of people chosen by filters (plan, account type, tag, joined,
    // activity), so the bell and email always reach the same audience. Older announcements are backfilled to who
    // they reached then. Plus private admin tags and notes on accounts.
    id: "0054_admin_crm",
    sql: `
create table announcement_recipients (
  announcement_id bigint not null references announcements(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  primary key (announcement_id, user_id)
);
create index announcement_recipients_user on announcement_recipients (user_id);
insert into announcement_recipients (announcement_id, user_id)
  select a.id, u.id from announcements a join users u on (a.audience = 'all' or u.plan = a.audience) and u.created_at <= a.created_at;
alter table announcements drop constraint if exists announcements_audience_check;
update announcements set audience = case audience when 'all' then 'Everyone' when 'free' then 'Free' when 'pro' then 'Pro' when 'team' then 'Team' else audience end;
alter table announcement_recipients enable row level security;
alter table users add column admin_tags text not null default '';
create table account_notes (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  admin_id bigint references users(id) on delete set null,
  body text not null,
  created_at bigint not null
);
create index account_notes_user on account_notes (user_id, created_at desc);
alter table account_notes enable row level security;
`,
  },
  {
    // Marketing consent, kept apart from product news, with when each was given (proof of consent).
    // Newsletter sign-ups from people without an account, confirmed by email (double opt-in).
    id: "0055_marketing_consent",
    sql: `
alter table users add column notify_marketing int not null default 0 check (notify_marketing in (0, 1));
alter table users add column product_consent_at bigint;
alter table users add column marketing_consent_at bigint;
update users set product_consent_at = created_at where notify_product = 1;
create table newsletter_subscribers (
  id bigint generated always as identity primary key,
  email text not null unique,
  token text not null unique,
  marketing int not null default 0 check (marketing in (0, 1)),
  source text not null default '',
  created_at bigint not null,
  confirmed_at bigint,
  unsubscribed_at bigint
);
alter table newsletter_subscribers enable row level security;
`,
  },
  {
    // Legal name for records, accounting and billing, kept private. The public name stays in users.name
    // (professional name, or the username when none is given). Older accounts fill these in from Settings.
    id: "0056_legal_name",
    sql: `
alter table users add column first_name text not null default '';
alter table users add column last_name text not null default '';
`,
  },
  {
    // Profile links on a receiver's page (Instagram, TikTok, Spotify, Apple Music, SoundCloud…), as JSON [{platform, url}].
    id: "0057_profile_links",
    sql: `
alter table users add column links text not null default '[]';
`,
  },
  {
    // Senders' own profile links (Instagram, Spotify…), remembered per receiver. Shown as "not verified".
    id: "0058_sender_links",
    sql: `
alter table senders add column links text not null default '[]';
`,
  },
  {
    // Releases: an EP or album sent as a folder, shown to the receiver as one release. Replaces folder batches (existing
    // batches become releases). Plus details read from the files themselves (track number, key, ISRC).
    id: "0059_releases",
    sql: `
create table releases (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{16,40}$'),
  user_id bigint not null references users(id) on delete cascade,
  sender_id bigint references senders(id) on delete set null,
  title text not null default '',
  artist text not null default '',
  kind text not null default 'ep' check (kind in ('ep', 'album')),
  created_at bigint not null
);
create index releases_user on releases (user_id, created_at desc);
alter table releases enable row level security;
insert into releases (id, user_id, sender_id, title, kind, created_at)
  select batch_id, min(user_id), min(sender_id), 'Folder', 'ep', min(created_at) from tracks
  where batch_id is not null and batch_id ~ '^[A-Za-z0-9_-]{16,40}$' group by batch_id;
alter table tracks rename column batch_id to release_id;
update tracks set release_id = null where release_id is not null and release_id not in (select id from releases);
alter table tracks add constraint tracks_release_fk foreign key (release_id) references releases(id) on delete set null;
create index tracks_release on tracks (release_id) where release_id is not null;
alter table tracks add column track_no int check (track_no between 1 and 99);
alter table tracks add column musical_key text not null default '';
alter table tracks add column isrc text not null default '';
`,
  },
  {
    // Which receivers accept EP/album folders, and how big: set per plan in Admin → Plans (0 = no folders).
    // Pro 1 GB, Team 3 GB. Replaces the "folders" feature switch, which went by the sender's plan.
    id: "0060_plan_folder_limit",
    sql: `
alter table plans add column folder_bytes bigint not null default 0 check (folder_bytes >= 0);
update plans set folder_bytes = 1073741824 where id = 'pro';
update plans set folder_bytes = 3221225472 where id = 'team';
delete from feature_switches where feature = 'folders';
`,
  },
  {
    // Up to 3 tracks sent together share one batch: one send against the daily limit, 250 MB between them.
    id: "0061_track_batches",
    sql: `
alter table tracks add column batch_id text;
create index tracks_send_batch on tracks (user_id, batch_id) where batch_id is not null;
`,
  },
  {
    // Senders without an account confirm their email with a 6-digit code before sending. Replaces the
    // "confirm your email" link in receipts (and its token); saved receipt wording drops that block.
    id: "0062_sender_codes",
    sql: `
create table sender_codes (
  email text primary key,
  code_hash text not null,
  expires_at bigint not null,
  attempts int not null default 0,
  created_at bigint not null
);
alter table sender_codes enable row level security;
alter table senders drop column verify_token;
update site_content set draft = replace(draft, '{confirm_block}', ''), published = replace(published, '{confirm_block}', '') where page = 'email_delivered';
`,
  },
  {
    // The admin area gets its own sign-in on its own host (ops.floortest.app): password and two-step code every time,
    // 1 hour idle / 8 hours at most. "View as" crosses to the main site with a single-use, 60-second ticket.
    id: "0063_ops_sessions",
    sql: `
create table admin_sessions (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  created_at bigint not null,
  last_seen_at bigint not null,
  expires_at bigint not null
);
create index admin_sessions_user on admin_sessions(user_id);
alter table admin_sessions enable row level security;
create table view_tickets (
  token_hash text primary key,
  admin_id bigint not null references users(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  expires_at bigint not null
);
alter table view_tickets enable row level security;
`,
  },
  {
    // Pro and Team receivers can cap a callout ("Stop at 50 tracks"). When the cap is reached the callout is marked
    // full and behaves like a closed one until the cap is raised or removed.
    id: "0064_callout_caps",
    sql: `
alter table collections add column max_tracks int check (max_tracks between 1 and 100000);
alter table collections add column full_at bigint;
`,
  },
  {
    // Collections (callouts) can have their own artwork, shown on the dashboard and on the link while receiving.
    id: "0065_collection_art",
    sql: `alter table collections add column art_key text;`,
  },
  {
    // The admin Overview counts recent sign-ups and tracks, and open messages and incidents, on every view.
    id: "0066_overview_indexes",
    sql: `
create index if not exists users_created on users(created_at);
create index if not exists tracks_created on tracks(created_at);
create index if not exists contact_open on contact_messages(topic) where handled_at is null;
create index if not exists incidents_open on incidents(kind) where resolved_at is null;
`,
  },
  {
    // The ops team: people the super admin (ADMIN_EMAILS) lets into ops with a role. Extra and removed permissions
    // are per person, on top of the role's defaults (see src/lib/ops-perms.ts).
    id: "0067_ops_members",
    sql: `
create table ops_members (
  user_id bigint primary key references users(id) on delete cascade,
  role text not null check (role in ('care', 'developer', 'product', 'sales')),
  grant_perms text not null default '',
  deny_perms text not null default '',
  invited_by bigint references users(id) on delete set null,
  created_at bigint not null,
  disabled_at bigint
);
alter table ops_members enable row level security;
`,
  },
  {
    // Yearly prices, set per plan in Admin → Plans (0 = not set yet). Pro and Team start at the agreed prices.
    id: "0068_yearly_prices",
    sql: `
alter table plans add column yearly_price_cents int not null default 0 check (yearly_price_cents between 0 and 1000000);
update plans set yearly_price_cents = 7799 where id = 'pro';
update plans set yearly_price_cents = 14499 where id = 'team';
`,
  },
  {
    // Discounts on top of list prices (Admin → Plans): a percentage off, an optional label and end date.
    // List prices never change; the plans page shows them struck through while a discount runs.
    id: "0069_plan_discounts",
    sql: `
alter table plans add column discount_pct int not null default 0 check (discount_pct between 0 and 90);
alter table plans add column discount_label text not null default '';
alter table plans add column discount_ends_at bigint;
`,
  },
  {
    // During the beta, Pro and Team are by request: people say who they are, ops approves the plan that fits.
    id: "0070_plan_requests",
    sql: `
create table plan_requests (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  plan text not null,
  kind text not null,
  org text not null default '',
  link text not null default '',
  volume text not null default '',
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  granted_plan text,
  decided_by bigint references users(id) on delete set null,
  decided_at bigint,
  decision_note text not null default '',
  created_at bigint not null
);
create unique index plan_requests_one_pending on plan_requests(user_id) where status = 'pending';
create index plan_requests_status on plan_requests(status, created_at);
alter table plan_requests enable row level security;
`,
  },
  {
    // Links between tables that had no index: deleting a track or account otherwise scans these tables in full.
    id: "0071_fk_indexes",
    sql: `
create index if not exists account_log_track on account_log(track_id) where track_id is not null;
create index if not exists takedowns_track on takedowns(track_id);
create index if not exists password_resets_user on password_resets(user_id);
create index if not exists releases_sender on releases(sender_id);
create index if not exists track_votes_user on track_votes(user_id);
create index if not exists users_referred_by on users(referred_by) where referred_by is not null;
`,
  },
  {
    // Track artwork: an optional image senders attach, for receivers whose plan includes it (Team).
    id: "0072_track_art",
    sql: `
alter table plans add column if not exists track_art integer not null default 0;
update plans set track_art = 1 where id = 'team';
alter table tracks add column if not exists art_key text;
`,
  },
  {
    // Google sign-in: the Google account (its permanent id) pinned to a FloorTest account, one each way.
    id: "0073_google_link",
    sql: `
alter table users add column if not exists google_sub text;
alter table users add column if not exists google_linked_at bigint;
create unique index if not exists users_google_sub on users(google_sub) where google_sub is not null;
`,
  },
  {
    // "View as" tickets remember the exact ops session that asked, so viewing ends with that session.
    id: "0074_view_ticket_session",
    sql: `alter table view_tickets add column if not exists session_hash text not null default '';`,
  },
  {
    // The mobile app signs in through the same sessions table (kind 'app'), so every "sign out everywhere",
    // password change and ops sign-out also signs out the phone.
    id: "0075_app_sessions",
    sql: `
alter table sessions add column if not exists kind text not null default 'web';
alter table sessions add column if not exists label text not null default '';
`,
  },
  {
    // "Email me when it reopens": senders who hit a closed, full or paused link leave an address; one email goes out
    // when that receiver's link takes uploads again. One pending row per address and receiver.
    id: "0076_reopen_alerts",
    sql: `
create table if not exists reopen_alerts (
  id serial primary key,
  user_id integer not null references users(id) on delete cascade,
  email text not null,
  created_at bigint not null,
  sent_at bigint
);
create unique index if not exists reopen_alerts_pending on reopen_alerts(user_id, email) where sent_at is null;
create index if not exists reopen_alerts_user on reopen_alerts(user_id);
alter table reopen_alerts enable row level security;
`,
  },
  {
    // Plan cards now derive their extras (folders, artwork, colleague downloads) from what each plan really enables,
    // so the seeded free-text lines that promised held or already-live features go. Only untouched seed text is replaced.
    id: "0077_plan_features_truth",
    sql: `
update plans set features = '["500 active tracks","Everything in Free"]'
  where id = 'pro' and features = '["500 active tracks","Everything in Free","Colleagues can download tracks you share","Paid features as they launch (stems, folders)"]';
update plans set features = '["2,000 active tracks","Everything in Pro"]'
  where id = 'team' and features = '["2,000 active tracks","Everything in Pro","Shared collections: up to 10 teammates listen and vote"]';
`,
  },
  {
    // Moving a link off a closed collection becomes the receiver's choice (Settings → Receiving), off by default:
    // a closing date set on purpose must never quietly reopen the link to another collection.
    id: "0078_reroute_opt_in",
    sql: `
alter table users add column if not exists reroute_closed integer not null default 0;
`,
  },
  {
    // Review Together: the owner and their teammates comment on tracks and keep one shared shortlist; the owner can let
    // teammates make the Keep / Not for me call. All internal to the team: senders never see any of it.
    id: "0079_review_together",
    sql: `
create table if not exists track_comments (
  id bigint generated always as identity primary key,
  track_id bigint not null references tracks(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  body text not null,
  created_at bigint not null
);
create index if not exists track_comments_track on track_comments(track_id, created_at);
alter table track_comments enable row level security;
create table if not exists track_shortlist (
  track_id bigint primary key references tracks(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  created_at bigint not null
);
alter table track_shortlist enable row level security;
alter table collections add column if not exists team_can_decide integer not null default 0;
`,
  },
  {
    // Share links keep only a fingerprint (SHA-256) of their secret, never the secret itself: a leaked database can't be
    // turned into working links. Existing links keep working (their fingerprint is taken now) and the plain codes go.
    id: "0080_share_token_hash",
    sql: `
alter table track_shares add column if not exists token_hash text;
update track_shares set token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex') where token is not null and token_hash is null;
alter table track_shares alter column token drop not null;
update track_shares set token = null;
create unique index if not exists track_shares_token_hash on track_shares(token_hash);
`,
  },
  {
    // Collection share links (sharing phase 2): their own random ID (only a fingerprint stored), named verified
    // recipients, email codes, short access sessions, requests to join, and an activity trail. Separate from the
    // submission link. Behind the "sharing" switch.
    id: "0081_collection_links",
    sql: `
create table if not exists collection_links (
  id bigint generated always as identity primary key,
  collection_id bigint not null references collections(id) on delete cascade,
  created_by bigint not null references users(id) on delete cascade,
  label text not null default '',
  token_hash text not null unique,
  generation int not null default 1,
  permission text not null check (permission in ('listen', 'download')),
  requests_on int not null default 1,
  requests_paused_at bigint,
  expires_at bigint,
  revoked_at bigint,
  created_at bigint not null
);
create index if not exists collection_links_collection on collection_links(collection_id);
create table if not exists link_recipients (
  id bigint generated always as identity primary key,
  link_id bigint not null references collection_links(id) on delete cascade,
  kind text not null check (kind in ('email', 'domain', 'user')),
  value text not null,
  permission text not null check (permission in ('listen', 'download')),
  expires_at bigint,
  added_by bigint references users(id) on delete set null,
  added_at bigint not null,
  removed_at bigint,
  request_id bigint
);
create unique index if not exists link_recipients_live on link_recipients(link_id, kind, value) where removed_at is null;
create table if not exists link_sessions (
  id bigint generated always as identity primary key,
  link_id bigint not null references collection_links(id) on delete cascade,
  recipient_id bigint references link_recipients(id) on delete cascade,
  email text not null,
  user_id bigint references users(id) on delete cascade,
  token_hash text not null unique,
  generation int not null,
  notice_version text not null,
  accepted_at bigint not null,
  created_at bigint not null,
  expires_at bigint not null,
  revoked_at bigint,
  last_seen_at bigint
);
create index if not exists link_sessions_link on link_sessions(link_id);
create table if not exists link_codes (
  link_id bigint not null references collection_links(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at bigint not null,
  attempts int not null default 0,
  created_at bigint not null,
  primary key (link_id, email)
);
create table if not exists link_requests (
  id bigint generated always as identity primary key,
  link_id bigint not null references collection_links(id) on delete cascade,
  collection_id bigint not null references collections(id) on delete cascade,
  email text not null,
  user_id bigint references users(id) on delete set null,
  name text not null default '',
  note text not null default '',
  status text not null check (status in ('pending', 'approved', 'declined', 'blocked')),
  created_at bigint not null,
  decided_at bigint,
  decided_by bigint references users(id) on delete set null
);
create index if not exists link_requests_link on link_requests(link_id, status);
create index if not exists link_requests_collection_email on link_requests(collection_id, email);
create table if not exists link_events (
  id bigint generated always as identity primary key,
  link_id bigint not null references collection_links(id) on delete cascade,
  email text,
  user_id bigint references users(id) on delete set null,
  kind text not null,
  track_id bigint references tracks(id) on delete set null,
  detail text not null default '',
  created_at bigint not null
);
create index if not exists link_events_link on link_events(link_id, created_at);
alter table collection_links enable row level security;
alter table link_recipients enable row level security;
alter table link_sessions enable row level security;
alter table link_codes enable row level security;
alter table link_requests enable row level security;
alter table link_events enable row level security;
`,
  },
  {
    // Which sharing wording a track was sent under (null: none, or the 1 Oct colleague model). Collection share
    // links play only tracks with a value here, so tracks sent before the new wording are never opened up.
    id: "0082_track_share_terms",
    sql: `
alter table tracks add column if not exists share_terms text;
`,
  },
  {
    // Account teams: a label, radio station or crew has one account (its owner's) and invites people to work its desk,
    // each with their own login. Seats come from the plan (Free 1, Pro 2, Team 5) plus add-on seats. Events and the
    // account log record which person did each thing. Behind the "teams" switch.
    id: "0083_account_teams",
    sql: `
create table if not exists account_members (
  id bigserial primary key,
  account_id bigint not null references users(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  invited_by bigint references users(id) on delete set null,
  created_at bigint not null,
  unique (account_id, user_id),
  check (account_id <> user_id)
);
create index if not exists account_members_user on account_members(user_id);
create table if not exists account_invites (
  id bigserial primary key,
  account_id bigint not null references users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by bigint references users(id) on delete set null,
  created_at bigint not null,
  expires_at bigint not null,
  accepted_at bigint,
  revoked_at bigint
);
create index if not exists account_invites_account on account_invites(account_id);
alter table users add column if not exists extra_seats int not null default 0 check (extra_seats between 0 and 500);
alter table plans add column if not exists seats int not null default 1 check (seats between 1 and 500);
update plans set seats = 2 where id = 'pro';
update plans set seats = 5 where id = 'team';
alter table events add column if not exists actor_id bigint references users(id) on delete set null;
alter table account_log add column if not exists actor_id bigint references users(id) on delete set null;
-- Who made each Keep / Not for me (and as what), so owners and admins can override members and not the other way round.
alter table tracks add column if not exists decided_by bigint references users(id) on delete set null;
alter table tracks add column if not exists decided_role text check (decided_role in ('owner', 'admin', 'member'));
-- Replies from members can need approval first: off, or on with one approver (the owner or a teammate).
alter table users add column if not exists reply_approval int not null default 0 check (reply_approval in (0, 1));
alter table users add column if not exists reply_approver_id bigint references users(id) on delete set null;
create table if not exists held_replies (
  id bigserial primary key,
  account_id bigint not null references users(id) on delete cascade,
  author_id bigint references users(id) on delete set null,
  sender_id bigint not null references senders(id) on delete cascade,
  track_id bigint references tracks(id) on delete set null,
  body text not null,
  status text not null default 'waiting' check (status in ('waiting', 'sent', 'rejected')),
  decided_by bigint references users(id) on delete set null,
  decided_at bigint,
  created_at bigint not null
);
create index if not exists held_replies_account on held_replies(account_id, status);
alter table account_members enable row level security;
alter table account_invites enable row level security;
alter table held_replies enable row level security;
`,
  },
  {
    // Review Together folds into account teams: the per-collection guest list (collection_members) and guest votes
    // (track_votes) are no longer read; their rows stay for now. Plan wording about them goes (seats show on cards).
    id: "0084_review_together_into_teams",
    sql: `
update plans set features = replace(features, ',"Shared collections: up to 10 teammates listen and vote"', '') where id = 'team';
update plans set features = replace(features, '"Colleagues can download tracks you share",', '') where id = 'pro';
`,
  },
  {
    // Drop the retired sharing and guest-review tables and columns (recorded in docs/retired.md): the 1 Oct per-track
    // colleague sharing and the per-collection Review Together guests. Nothing reads or writes them since 11 Oct.
    id: "0085_drop_retired",
    sql: `
drop table if exists share_access;
drop table if exists track_shares;
drop table if exists share_requests;
drop table if exists track_votes;
drop table if exists collection_members;
alter table tracks drop constraint if exists tracks_flags;
alter table tracks drop column if exists share_download;
alter table tracks add constraint tracks_flags check (share_ok in (0, 1) and sets_ok in (0, 1)) not valid;
alter table plans drop column if exists share_downloads;
alter table collections drop column if exists team_can_decide;
delete from feature_switches where feature = 'shared';
`,
  },
  {
    // The bell on a team desk is per person: each member keeps their own seen and cleared times for that desk,
    // so one person clearing it doesn't empty everyone else's.
    id: "0086_member_bell",
    sql: `
alter table account_members add column if not exists notifications_seen_at bigint;
alter table account_members add column if not exists notifications_cleared_at bigint;
`,
  },
  {
    // The recovery copy (the "vault": a second private bucket with its own key). One row per stored file already
    // copied there, so the nightly copy only sends what's new, and a privacy deletion knows to delete the copy too.
    id: "0087_vault_copies",
    sql: `
create table if not exists vault_copies (
  file_key text primary key,
  size bigint,
  copied_at bigint not null
);
alter table vault_copies enable row level security;
`,
  },
  {
    // The Monday "Did any of these get played?" prompt on DJ desks: the Monday (local date) it was last answered, so
    // marking tracks or "None this weekend" closes it until the next week.
    id: "0088_played_out_prompt",
    sql: `
alter table users add column if not exists played_out_prompt_week text;
`,
  },
  {
    // The Tuesday reminder for the same question, sent once per week (the Monday date it was sent for).
    id: "0089_played_out_reminder",
    sql: `
alter table users add column if not exists played_out_reminded_week text;
`,
  },
  {
    // The names of the stems a sender uploaded, kept apart from the stem files: the files leave with the track, the
    // sender's receipt keeps its list, so it never shows that the track left the desk.
    id: "0090_stems_sent",
    sql: `
alter table tracks add column if not exists stems_sent text;
update tracks t set stems_sent = (select json_agg(s.name order by s.created_at)::text from stems s where s.track_id = t.id)
  where exists (select 1 from stems s where s.track_id = t.id);
`,
  },
  {
    // Emails already in the outbox keep their sign-in codes and private links (receipts, resets, invites, email
    // confirmations, sender history). New ones are stored with them hidden (sendMail secrets); this hides the old ones
    // the same way, so the Email log and Settings → Notifications never show a way into an account or a receipt.
    id: "0091_outbox_hide_secrets",
    sql: `
update outbox set
  body = regexp_replace(
    regexp_replace(body, '/(receipt|reset|verify-email|confirm-email|join|sent|newsletter/confirm)/[A-Za-z0-9._~-]+', '/\\1/•••••• (hidden)', 'g'),
    '(sign-in code is:|code to open a private FloorTest collection:|code to confirm your email and send your music:)(\\s+)[0-9]{6}', '\\1\\2•••••• (hidden)', 'g'),
  subject = regexp_replace(subject, '^(\\[Staging → [^]]*\\] )?[0-9]{6}( is your FloorTest)', '\\1•••••• (hidden)\\2')
where body ~ '/(receipt|reset|verify-email|confirm-email|join|sent|newsletter/confirm)/[A-Za-z0-9._~-]+'
   or subject ~ '[0-9]{6} is your FloorTest';
update incidents set detail = regexp_replace(detail, '^(\\[Staging → [^]]*\\] )?[0-9]{6}( is your FloorTest)', '\\1•••••• (hidden)\\2')
where kind = 'email_failed' and detail ~ '[0-9]{6} is your FloorTest';
`,
  },  {
    // A deleted account's link names stay reserved (with no account behind them), so nobody can take over a link
    // that's still in bios and on flyers and receive music meant for someone else.
    id: "0092_released_handles",
    sql: `
create table released_handles (
  handle text primary key,
  released_at bigint not null,
  expires_at bigint not null
);
alter table released_handles enable row level security;
`,
  },  {
    // An upload is finished once: completing claims it first, so two completes sent at the same moment can't each
    // make a track (or a stem). A claim older than a few minutes (a crash mid-way) can be taken again.
    // checked_at: the start passed the send limits, so it counts as a release's or batch's first track.
    id: "0093_upload_claims",
    // storage_deletions.not_before: a file whose upload link may still be live is deleted again once it has expired.
    sql: `alter table uploads add column claimed_at bigint;
alter table uploads add column checked_at bigint;
alter table storage_deletions add column not_before bigint;`,
  },
  {
    // Email-change and email-confirmation links are stored as their SHA-256 (like reset and session tokens), so a copy
    // of the database holds nothing that works as the link. Links already sent keep working: their stored values are
    // hashed here the same way (a raw link is 32 characters, never 64 hex, so this runs once).
    id: "0094_hash_email_tokens",
    sql: `update users set email_verify_token = encode(sha256(convert_to(email_verify_token, 'UTF8')), 'hex')
where email_verify_token is not null and email_verify_token !~ '^[a-f0-9]{64}$';
update users set pending_email_token = encode(sha256(convert_to(pending_email_token, 'UTF8')), 'hex')
where pending_email_token is not null and pending_email_token !~ '^[a-f0-9]{64}$';`,
  },
  {
    // Seven account types instead of three (owner, 14 Oct): DJ, Producer / DJ, A&R, Label / Radio, Artist, Curator, Music
    // professional. Existing accounts move to the nearest one (producer → Producer / DJ, label → Label / Radio). kind_note
    // is an optional "what do you do"; tools holds the owner's on/off choices that differ from the type's defaults.
    id: "0095_account_types",
    sql: `
alter table users drop constraint if exists users_kind_check;
update users set kind = 'producer_dj' where kind = 'producer';
update users set kind = 'label_radio' where kind = 'label';
alter table users add constraint users_kind_check check (kind in ('dj', 'producer_dj', 'ar', 'label_radio', 'artist', 'curator', 'music_pro'));
alter table users add column kind_note text not null default '';
alter table users add column tools text;
`,
  },
  {
    // Sessions remember which device signed in (for the Security page's devices list) and when they were last used:
    // a browser session idle for 14 days ends, and the list shows "last used".
    id: "0095_session_devices",
    sql: `alter table sessions add column last_seen_at bigint;
alter table sessions add column device text not null default '';`,
  },
  {
    // "Listened" counted by the server (Codex review, 19 Oct): one row per person and track while it plays. The player
    // checks in about every 10 s; each check-in is credited with no more than the real time since the last one (capped),
    // so the browser can't claim a listen it didn't sit through. Tied to the sign-in it started from. Gone once the
    // track counts as listened, or with the track.
    id: "0096_listen_sessions",
    sql: `create table listens (
  track_id bigint not null references tracks(id) on delete cascade,
  actor_id bigint not null references users(id) on delete cascade,
  session_hash text not null,
  started_at bigint not null,
  last_beat_at bigint,
  credited_ms bigint not null default 0 check (credited_ms >= 0),
  primary key (track_id, actor_id)
);
alter table listens enable row level security;`,
  },
  {
    // Each provider webhook event is acted on once (Codex review, 19 Oct): its ID is recorded before anything changes,
    // so a retried or replayed delivery report (and later Paddle events) does nothing twice. Kept 30 days.
    id: "0097_webhook_receipts",
    sql: `create table webhook_receipts (
  provider text not null,
  event_id text not null,
  received_at bigint not null,
  primary key (provider, event_id)
);
create index webhook_receipts_age on webhook_receipts(received_at);
alter table webhook_receipts enable row level security;`,
  },
  {
    // Per-person rules (owner, 21 Oct): a second lock under the app's own checks. The app's login owns the tables, so
    // row-level security doesn't apply to it; code that works for a signed-in person switches to `ft_person` for that
    // transaction (`asPerson` in src/lib/db) with `ft.person` set to their id. As `ft_person` a row is visible only on a
    // desk the person may work (their own, or a team account they're a member of). Tables not granted here refuse
    // `ft_person` outright, so a path that needs them fails loudly instead of quietly seeing nothing.
    id: "0097_person_rules",
    sql: `do $$ begin if not exists (select 1 from pg_roles where rolname = 'ft_person') then create role ft_person nologin; end if; end $$;
grant ft_person to current_user with set true;
create or replace function ft_person_id() returns bigint language sql stable as $$ select nullif(current_setting('ft.person', true), '')::bigint $$;
create or replace function ft_desk(desk bigint) returns boolean language sql stable security definer set search_path = public as $$ select desk = ft_person_id() or exists (select 1 from account_members m where m.account_id = desk and m.user_id = ft_person_id()) $$;
create or replace function ft_sees_user(uid bigint) returns boolean language sql stable security definer set search_path = public as $$ select ft_desk(uid) or exists (select 1 from account_members m where m.user_id = uid and ft_desk(m.account_id)) $$;
revoke all on function ft_desk(bigint) from public;
revoke all on function ft_sees_user(bigint) from public;
grant execute on function ft_person_id(), ft_desk(bigint), ft_sees_user(bigint) to ft_person;
grant select, update on users to ft_person;
grant select on account_members to ft_person;
grant select, insert, update, delete on collections, tracks, senders, releases, events, stems, listens, track_comments, track_shortlist, held_replies to ft_person;
create policy person_users_read on users for select to ft_person using (ft_sees_user(id));
create policy person_users_own on users for update to ft_person using (id = ft_person_id()) with check (id = ft_person_id());
create policy person_members on account_members for select to ft_person using (user_id = ft_person_id() or ft_desk(account_id));
create policy person_collections on collections for all to ft_person using (ft_desk(user_id)) with check (ft_desk(user_id));
create policy person_tracks on tracks for all to ft_person using (ft_desk(user_id)) with check (ft_desk(user_id));
create policy person_senders on senders for all to ft_person using (ft_desk(user_id)) with check (ft_desk(user_id));
create policy person_releases on releases for all to ft_person using (ft_desk(user_id)) with check (ft_desk(user_id));
create policy person_events on events for all to ft_person using (ft_desk(user_id)) with check (ft_desk(user_id));
create policy person_held_replies on held_replies for all to ft_person using (ft_desk(account_id)) with check (ft_desk(account_id));
create policy person_stems on stems for all to ft_person using (exists (select 1 from tracks t where t.id = stems.track_id)) with check (exists (select 1 from tracks t where t.id = stems.track_id));
create policy person_listens on listens for all to ft_person using (exists (select 1 from tracks t where t.id = listens.track_id)) with check (actor_id = ft_person_id() and exists (select 1 from tracks t where t.id = listens.track_id));
create policy person_comments on track_comments for all to ft_person using (exists (select 1 from tracks t where t.id = track_comments.track_id)) with check (user_id = ft_person_id() and exists (select 1 from tracks t where t.id = track_comments.track_id));
create policy person_shortlist on track_shortlist for all to ft_person using (exists (select 1 from tracks t where t.id = track_shortlist.track_id)) with check (exists (select 1 from tracks t where t.id = track_shortlist.track_id));`,
  },
  {
    // Integrity (Codex review, phase B items 2 and 3; 24 Oct). Additive only: new rules are NOT VALID, so they bind every
    // new or changed row without rechecking history, and nothing here drops or rewrites data except closing duplicate
    // live invites (the newest stays).
    // - tracks.upload_ref: the fingerprint of the upload a track came from, unique, so a retried "complete" returns the
    //   same track instead of making a second one (src/lib/intake.ts completeUpload).
    // - request_claims: one row per action that must happen once (a reply), claimed before it runs (src/lib/once.ts).
    // - Ownership the database can check: a track's sender and collection, an event's sender and a held reply's sender
    //   are on the same desk as the row itself.
    // - Sizes and lengths can't go below zero; one live invite per email per team.
    id: "0098_integrity",
    sql: `alter table tracks add column if not exists upload_ref text;
create unique index if not exists tracks_upload_ref on tracks(upload_ref) where upload_ref is not null;
create table if not exists request_claims (
  scope text not null,
  key text not null,
  created_at bigint not null,
  primary key (scope, key)
);
create index if not exists request_claims_age on request_claims(created_at);
alter table request_claims enable row level security;
alter table senders add constraint senders_id_desk unique (id, user_id);
alter table collections add constraint collections_id_desk unique (id, user_id);
alter table tracks add constraint tracks_sender_same_desk foreign key (sender_id, user_id) references senders(id, user_id) on delete cascade not valid;
alter table tracks add constraint tracks_collection_same_desk foreign key (collection_id, user_id) references collections(id, user_id) on delete set null (collection_id) not valid;
alter table events add constraint events_sender_same_desk foreign key (sender_id, user_id) references senders(id, user_id) on delete cascade not valid;
alter table held_replies add constraint held_replies_sender_same_desk foreign key (sender_id, account_id) references senders(id, user_id) on delete cascade not valid;
alter table uploads add constraint uploads_size_ok check (size >= 0) not valid;
alter table stems add constraint stems_size_ok check (size >= 0) not valid;
alter table tracks add constraint tracks_duration_ok check (duration is null or duration >= 0) not valid;
update account_invites set revoked_at = created_at where accepted_at is null and revoked_at is null
  and id not in (select max(id) from account_invites where accepted_at is null and revoked_at is null group by account_id, lower(email));
create unique index if not exists account_invites_one_live on account_invites(account_id, lower(email)) where accepted_at is null and revoked_at is null;`,
  },
  {
    // Leftover uploads (Codex review, 24 Oct): a cover photo, collection artwork or site image is written down here
    // before it is stored and crossed off once the database points to it; the nightly job queues the ones nothing
    // points to after a week (src/lib/file-reservations.ts). No personal data: storage keys only.
    id: "0099_file_reservations",
    sql: `create table if not exists file_reservations (
  file_key text primary key,
  kind text not null check (kind in ('cover', 'collection_art', 'site_image')),
  created_at bigint not null
);
create index if not exists file_reservations_age on file_reservations(created_at);
alter table file_reservations enable row level security;`,
  },
  {
    // File fingerprints (Codex review, phase B item 1, 24 Oct): a SHA-256 and byte size per stored file, computed by the
    // server from its own copy; status 'mismatch' or 'missing' holds the file back (src/lib/file-digests.ts). No row
    // means not checked yet. Storage keys and hashes only, no personal data.
    id: "0100_file_digests",
    sql: `create table if not exists file_digests (
  file_key text primary key,
  sha256 text not null,
  size bigint not null check (size >= 0),
  checked_at bigint not null,
  status text not null default 'ok' check (status in ('ok', 'mismatch', 'missing'))
);
create index if not exists file_digests_checked on file_digests(checked_at);
alter table file_digests enable row level security;`,
  },
  {
    // The outbox is the send queue (Codex review, phase B item 4; src/lib/mail.ts): `payload` holds the real text, sealed
    // with a key from APP_SECRET, until the email has gone or given up; `idem_key` is the Resend idempotency key, so a
    // retried send can't arrive twice; `optional` marks emails a spam complaint stops. Earlier rows are already final.
    id: "0101_outbox_queue",
    sql: `alter table outbox add column if not exists payload text;
alter table outbox add column if not exists idem_key text;
alter table outbox add column if not exists attempts int not null default 0 check (attempts >= 0);
alter table outbox add column if not exists next_at bigint;
alter table outbox add column if not exists last_attempt_at bigint;
alter table outbox add column if not exists optional int not null default 0 check (optional in (0, 1));
create unique index if not exists outbox_idem_key on outbox(idem_key) where idem_key is not null;
create index if not exists outbox_due on outbox(next_at) where payload is not null;`,
  },
  {
    // An index behind every foreign key (plan B7 item 1, 24 Oct): deleting a user, sender, track or collection, and
    // joins on these columns, no longer scan whole tables as data grows. Additive only. tests/fk-indexes.test.ts fails
    // if a later migration adds a foreign key without one.
    id: "0102_fk_indexes",
    sql: `create index if not exists fk_account_actions_admin_id on account_actions(admin_id);
create index if not exists fk_account_invites_invited_by on account_invites(invited_by);
create index if not exists fk_account_log_actor_id on account_log(actor_id);
create index if not exists fk_account_members_invited_by on account_members(invited_by);
create index if not exists fk_account_notes_admin_id on account_notes(admin_id);
create index if not exists fk_admin_log_admin_id on admin_log(admin_id);
create index if not exists fk_announcements_admin_id on announcements(admin_id);
create index if not exists fk_collection_links_created_by on collection_links(created_by);
create index if not exists fk_events_actor_id on events(actor_id);
create index if not exists fk_events_sender_id_user_id on events(sender_id, user_id);
create index if not exists fk_feature_switches_admin_id on feature_switches(admin_id);
create index if not exists fk_held_replies_author_id on held_replies(author_id);
create index if not exists fk_held_replies_decided_by on held_replies(decided_by);
create index if not exists fk_held_replies_sender_id on held_replies(sender_id);
create index if not exists fk_held_replies_sender_id_account_id on held_replies(sender_id, account_id);
create index if not exists fk_held_replies_track_id on held_replies(track_id);
create index if not exists fk_link_events_track_id on link_events(track_id);
create index if not exists fk_link_events_user_id on link_events(user_id);
create index if not exists fk_link_recipients_added_by on link_recipients(added_by);
create index if not exists fk_link_requests_decided_by on link_requests(decided_by);
create index if not exists fk_link_requests_user_id on link_requests(user_id);
create index if not exists fk_link_sessions_recipient_id on link_sessions(recipient_id);
create index if not exists fk_link_sessions_user_id on link_sessions(user_id);
create index if not exists fk_listens_actor_id on listens(actor_id);
create index if not exists fk_ops_members_invited_by on ops_members(invited_by);
create index if not exists fk_partner_notes_admin_id on partner_notes(admin_id);
create index if not exists fk_plan_requests_decided_by on plan_requests(decided_by);
create index if not exists fk_platform_blocks_admin_id on platform_blocks(admin_id);
create index if not exists fk_site_content_admin_id on site_content(admin_id);
create index if not exists fk_site_content_versions_admin_id on site_content_versions(admin_id);
create index if not exists fk_switches_admin_id on switches(admin_id);
create index if not exists fk_takedowns_admin_id on takedowns(admin_id);
create index if not exists fk_track_comments_user_id on track_comments(user_id);
create index if not exists fk_track_shortlist_user_id on track_shortlist(user_id);
create index if not exists fk_tracks_collection_id_user_id on tracks(collection_id, user_id);
create index if not exists fk_tracks_decided_by on tracks(decided_by);
create index if not exists fk_tracks_sender_id_user_id on tracks(sender_id, user_id);
create index if not exists fk_users_active_collection_id on users(active_collection_id);
create index if not exists fk_users_plan on users(plan);
create index if not exists fk_users_reply_approver_id on users(reply_approver_id);
create index if not exists fk_view_tickets_admin_id on view_tickets(admin_id);
create index if not exists fk_view_tickets_user_id on view_tickets(user_id);`,
  },
  {
    // Hold and scan (plan B10 option 3, owner 26 Oct): when the virus scanner is asleep or can't be reached, a finished
    // upload waits here instead of being refused, and the every-10-minutes job wakes the scanner once for the whole
    // batch. held_analysis is the browser's analysis (duration, bpm, peaks) for when the track is made. Additive only.
    id: "0103_held_uploads",
    sql: `alter table uploads add column if not exists held_at bigint;
alter table uploads add column if not exists held_analysis text;
alter table uploads add column if not exists held_tries integer not null default 0;
create index if not exists uploads_held on uploads(held_at) where held_at is not null;`,
  },
  {
    // Targeted switches (owner, 27 Oct): an optional "who sees it" rule on a feature switch (lib/switch-rules), JSON,
    // null for everyone. Additive only: code without it reads key and on_ as before and its upsert leaves rule alone.
    id: "0104_switch_rules",
    sql: `alter table switches add column if not exists rule text;`,
  },
  {
    // Passkeys (owner, 29 Oct): desk accounts sign in with a passkey, or use one as the two-step step (lib/passkeys).
    // Only the public key is kept; the private key never leaves the person's device or password manager.
    // passkey_challenges holds each one-time challenge for 5 minutes, keyed by the hash of a random id in a cookie;
    // using one deletes it. Neither table is granted to ft_person: only the app's own connection reads them.
    id: "0105_passkeys",
    sql: `create table if not exists passkeys (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text not null default '[]',
  device_type text not null default 'singleDevice',
  backed_up boolean not null default false,
  name text not null default 'Passkey',
  created_at bigint not null,
  last_used_at bigint
);
create index if not exists passkeys_user on passkeys(user_id);
alter table passkeys enable row level security;
create table if not exists passkey_challenges (
  id_hash text primary key,
  challenge text not null,
  user_id bigint references users(id) on delete cascade,
  purpose text not null,
  expires_at bigint not null
);
create index if not exists fk_passkey_challenges_user_id on passkey_challenges(user_id);
alter table passkey_challenges enable row level security;`,
  },
  {
    // Feedback from a team desk is signed by the teammate who sent it (lib/feedback); user_id stays the desk.
    id: "0106_feedback_actor",
    sql: `alter table contact_messages add column if not exists actor_id bigint references users(id) on delete set null;
create index if not exists fk_contact_messages_actor_id on contact_messages(actor_id);`,
  },
  {
    // A draft-preview pass from ops works once (lib/draft-preview redeemPass): spent passes, by signature hash, until
    // they'd have expired anyway (60 s). Not granted to ft_person: only the app's own connection reads it.
    id: "0107_preview_passes_used",
    sql: `create table if not exists preview_passes_used (
  sig_hash text primary key,
  expires_at bigint not null
);
create index if not exists preview_passes_used_expiry on preview_passes_used(expires_at);
alter table preview_passes_used enable row level security;`,
  },
  {
    // Per-person rules, tighter (security audit, 29 Oct). 0097 let `ft_person` read and change every column of users,
    // and a person may see their teammates' rows, so a query run as a person could have read a teammate's password
    // hash, two-step secret, recovery codes or Google id. Now `ft_person` may read only the columns the app reads about
    // a person (USER_COLUMNS in src/lib/db) and change only their own profile fields; anything else is refused outright.
    // A team desk that FloorTest has suspended is also shut to its teammates here, as currentUser() already does.
    // The "teams" switch stays an app check (lib/account-members teamsOn): it depends on ADMIN_EMAILS, the request's
    // country and the switch's rule, none of which the database holds.
    id: "0108_person_columns",
    sql: `revoke select, update on users from ft_person;
grant select (id, email, name, first_name, last_name, kind, kind_note, tools, links, handle, plan, active_collection_id, role_line, cover_key, page_style, paused_at, pause_until, pause_message, tz, email_verified_at, totp_enabled_at, signin_alerts, identity_status, created_at) on users to ft_person;
grant update (name, first_name, last_name, kind, kind_note, tools, links, role_line, cover_key, page_style, paused_at, pause_until, pause_message, tz, active_collection_id) on users to ft_person;`,
  },
  {
    // Per-person rules and suspended desks (security audit H25, 29 Oct): a team desk that FloorTest has suspended is
    // shut to its teammates in the database too, as currentUser() already does in the app. The person's own desk is
    // unchanged (a suspended person can't sign in). The "teams" switch stays an app check only (teamsOn in
    // lib/account-members): it depends on ADMIN_EMAILS, the request's country and the switch's rule, none of which the
    // database holds, so a copy here would disagree with the app.
    id: "0109_person_suspended_desks",
    sql: `create or replace function ft_desk(desk bigint) returns boolean language sql stable security definer set search_path = public as $$ select desk = ft_person_id() or exists (select 1 from account_members m join users u on u.id = m.account_id where m.account_id = desk and m.user_id = ft_person_id() and u.suspended_at is null) $$;
revoke all on function ft_desk(bigint) from public;
grant execute on function ft_desk(bigint) to ft_person;`,
  },
  {
    // App refresh tokens already swapped for new ones (lib/app-auth), kept until they would have expired. One coming back
    // means it was copied, so that sign-in ends. Holds hashes only; not granted to ft_person, left out of backups.
    id: "0111_app_refresh_spent",
    sql: `create table if not exists app_refresh_spent (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  signed_in_at bigint not null,
  expires_at bigint not null
);
create index if not exists fk_app_refresh_spent_user_id on app_refresh_spent(user_id);
alter table app_refresh_spent enable row level security;`,
  },
  {
    // The ticket between the two sign-in steps (lib/two-step-ticket) becomes a one-time row, like passkey_challenges:
    // the cookie holds a random id, this holds its hash for 5 minutes, and the second step deletes it. Not granted to
    // ft_person, left out of backups.
    id: "0112_two_step_tickets",
    sql: `create table if not exists two_step_tickets (
  id_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires_at bigint not null
);
create index if not exists fk_two_step_tickets_user_id on two_step_tickets(user_id);
alter table two_step_tickets enable row level security;`,
  },
  {
    // One send, one email (owner, 29 Oct): a track sent with others waits here for its sender's receipt, so every track
    // of the send goes out in one "Delivered" email (lib/send-receipts). Set when the track is saved, cleared when that
    // email is queued; the mail job sends anything still waiting 15 minutes after the send's last track.
    id: "0113_send_receipts",
    sql: `alter table tracks add column if not exists receipt_due_at bigint;
create index if not exists tracks_receipt_due on tracks(receipt_due_at) where receipt_due_at is not null;`,
  },
  {
    // Account emails (sign-in codes, resets, email checks, email changes) are marked when queued (lib/mail): only they may
    // use the last MAIL_RESERVED_SHARE of the day's send limit, so receipts and notifications can't starve them.
    id: "0114_outbox_reserved",
    sql: `alter table outbox add column if not exists reserved int not null default 0 check (reserved in (0, 1));`,
  },
  {
    // Confirm first (H76, 29 Oct): "Email me when it reopens" emails a typed address only to ask it to confirm. The
    // link's key is kept as a hash for 24 hours and works once; an unconfirmed request never gets the reopen email.
    // Requests made before this have no confirmation and stay unsent (the yearly clean-up removes them).
    // sender_links (H78): the /sent link is a random id kept as a hash, so the URL carries no email and a link can be
    // ended early. Holds hashes only; not granted to ft_person, left out of backups.
    id: "0115_reopen_confirm_sender_links",
    sql: `alter table reopen_alerts add column if not exists confirm_hash text;
alter table reopen_alerts add column if not exists confirm_expires_at bigint;
alter table reopen_alerts add column if not exists confirmed_at bigint;
create unique index if not exists reopen_alerts_confirm on reopen_alerts(confirm_hash) where confirm_hash is not null;
create table if not exists sender_links (
  id_hash text primary key,
  email text not null,
  created_at bigint not null,
  expires_at bigint not null,
  revoked_at bigint
);
create index if not exists sender_links_email on sender_links(lower(email));
create index if not exists sender_links_expires on sender_links(expires_at);
alter table sender_links enable row level security;`,
  },
  {
    // The virus scanner's daily budget (audit, 29 Oct; lib/scan-budget): wake-ups and running minutes charged per UTC
    // day to the whole platform ('all') and to each sender (a hash of their mailbox, never the email). Only the app's
    // own connection reads it.
    id: "0116_scanner_budget",
    sql: `create table if not exists scanner_budget (
  day text not null,
  scope text not null,
  wakes integer not null default 0,
  awake_ms bigint not null default 0,
  awake_until bigint not null default 0,
  spent_at bigint,
  primary key (day, scope)
);
alter table scanner_budget enable row level security;`,
  },
  {
    // The email caps count today's sends by status and send time on every email (mail.ts overSharedPart,
    // email-budget mailedToday): without this they read the whole outbox as it grows (audit, 1 Nov). Additive only.
    id: "0117_outbox_status_attempt",
    sql: `create index if not exists outbox_status_attempt on outbox(status, last_attempt_at);`,
  },
  {
    // Per-person rules (B8, 1 Nov): held_replies takes its id from a plain sequence, not an identity column, so
    // ft_person could add the row but not draw its id ("permission denied for sequence"). A member's held reply now
    // runs as the person, so the role may use that one sequence. Grant only; scripts/check-rls.ts fails on the next one.
    id: "0118_person_held_reply_ids",
    sql: `do $$ begin execute format('grant usage on sequence %s to ft_person', pg_get_serial_sequence('held_replies', 'id')); end $$;`,
  },
  {
    // Per-person rules (B8, 1 Nov): the desk finds its share links, their recipients and their requests as the person
    // (lib/share-links.ts, the owner's side). Read only, and only on a collection the person may see (its own policy
    // decides); never the link's fingerprint. Changes stay the app's: they sign listeners out and keep the history.
    id: "0119_person_link_lookups",
    sql: `grant select (id, collection_id, created_by, label, generation, permission, requests_on, requests_paused_at, expires_at, revoked_at, created_at) on collection_links to ft_person;
grant select on link_recipients, link_requests to ft_person;
create policy person_links_read on collection_links for select to ft_person using (exists (select 1 from collections c where c.id = collection_links.collection_id));
create policy person_link_recipients_read on link_recipients for select to ft_person using (exists (select 1 from collection_links l where l.id = link_recipients.link_id));
create policy person_link_requests_read on link_requests for select to ft_person using (exists (select 1 from collection_links l where l.id = link_requests.link_id));`,
  },
  {
    // Hub review of 0119 (1 Nov): a team member sees the desk's collections, so 0119 let them read the desk's links,
    // who they're shared with and the requests to join, though only the owner and admins manage links (the app's
    // requireRole("admin")). Link reads now need ft_desk_admin: the desk's owner, or an admin on its team while the desk
    // isn't suspended. Recipients and requests follow the link. A new migration, not an edit: 0119 may already have run on Preview.
    id: "0120_person_links_admins_only",
    sql: `create or replace function ft_desk_admin(desk bigint) returns boolean language sql stable security definer set search_path = public as $$ select desk = ft_person_id() or exists (select 1 from account_members m join users u on u.id = m.account_id where m.account_id = desk and m.user_id = ft_person_id() and m.role = 'admin' and u.suspended_at is null) $$;
revoke all on function ft_desk_admin(bigint) from public;
grant execute on function ft_desk_admin(bigint) to ft_person;
drop policy if exists person_links_read on collection_links;
create policy person_links_read on collection_links for select to ft_person using (exists (select 1 from collections c where c.id = collection_links.collection_id and ft_desk_admin(c.user_id)));`,
  },
  {
    // Ops → Moderation → Keep (ops server design, 1 Nov): when a staff member reviewed a track and kept it, so search can
    // say "Reviewed by @x" and the moderation queue (only tracks with a real signal: an open takedown claim, a sender
    // blocked by receivers, a late scanner check; owner, 1 Nov) can drop it once kept. Additive only. The index keeps deleting a
    // staff account from scanning every track (tests/fk-indexes.test.ts); only reviewed tracks are in it.
    id: "0121_track_ops_review",
    sql: `alter table tracks add column ops_reviewed_at bigint;
alter table tracks add column ops_reviewed_by bigint references users(id) on delete set null;
create index if not exists tracks_ops_reviewed_by on tracks(ops_reviewed_by) where ops_reviewed_by is not null;`,
  },
  {
    // Staff verification with reason and proof (owner, 1 Nov): every Verified mark staff add has a record of why and the
    // proof, so other teams can check it. A proposal is pending until someone with "verification.approve" (never its
    // proposer) approves or declines it; a direct verification is written as an approved proposal decided by the same
    // person. One pending proposal per account (the partial unique index). Proof files live in the private bucket under
    // random keys (verification/…), served only through /api/admin/verification-proofs/[id]. Rows go with the account
    // (cascade; their files are queued by accountKeys). The app's own connection only: RLS on, no policies, no grants.
    id: "0122_verification_proposals",
    sql: `create table if not exists verification_proposals (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  proposer_id bigint references users(id) on delete set null,
  reason text not null check (char_length(reason) between 10 and 500),
  links text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at bigint not null,
  decided_by bigint references users(id) on delete set null,
  decided_at bigint,
  decision_note text not null default ''
);
create unique index if not exists verification_proposals_one_pending on verification_proposals(user_id) where status = 'pending';
create index if not exists verification_proposals_user on verification_proposals(user_id, created_at desc);
create index if not exists verification_proposals_waiting on verification_proposals(created_at) where status = 'pending';
create index if not exists verification_proposals_proposer on verification_proposals(proposer_id) where proposer_id is not null;
create index if not exists verification_proposals_decided_by on verification_proposals(decided_by) where decided_by is not null;
alter table verification_proposals enable row level security;
create table if not exists verification_proofs (
  id bigint generated always as identity primary key,
  proposal_id bigint not null references verification_proposals(id) on delete cascade,
  file_key text not null unique,
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size bigint not null check (size > 0 and size <= 10485760),
  original_name text not null default '',
  created_at bigint not null
);
create index if not exists verification_proofs_proposal on verification_proofs(proposal_id);
alter table verification_proofs enable row level security;
alter table file_reservations drop constraint if exists file_reservations_kind_check;
alter table file_reservations add constraint file_reservations_kind_check check (kind in ('cover', 'collection_art', 'site_image', 'verification_proof'));`,
  },
];
